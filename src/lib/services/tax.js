import { prisma } from '../prisma.js';
import { audit } from '../audit.js';
import { monthRange } from '../dates.js';
import { round2, signed } from '../domain/accounting.js';
import { date, ensure, id as idOf, month, number, object, text } from '../validation.js';
import { docNumber, postJournal, removeJournal } from './ledger.js';

const months = (year) => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

async function lineSums(accountIds, from, to) {
  if (!accountIds.length) return [];
  return prisma.journalLine.findMany({ where: { accountId: { in: accountIds }, date: { gte: from, lte: to } }, select: { accountId: true, date: true, debit: true, credit: true } });
}

/** Rekap PPN per masa: keluaran (invoice) vs masukan (tagihan vendor). */
export async function ppnRecap(year) {
  const taxes = await prisma.tax.findMany({ where: { type: 'ADDITION' } });
  const outIds = [...new Set(taxes.map((t) => t.salesAccountId).filter(Boolean))];
  const inIds = [...new Set(taxes.map((t) => t.purchaseAccountId).filter(Boolean))];
  const from = new Date(Date.UTC(year, 0, 1)), to = new Date(Date.UTC(year, 11, 31));
  const lines = await lineSums([...outIds, ...inIds], from, to);
  const rows = months(year).map((m) => ({ period: m, output: 0, input: 0 }));
  for (const l of lines) {
    const r = rows[new Date(l.date).getUTCMonth()];
    if (outIds.includes(l.accountId)) r.output += Number(l.credit) - Number(l.debit);
    if (inIds.includes(l.accountId)) r.input += Number(l.debit) - Number(l.credit);
  }
  rows.forEach((r) => { r.output = round2(r.output); r.input = round2(r.input); r.net = round2(r.output - r.input); });
  const invoices = await prisma.invoice.findMany({
    where: { date: { gte: from, lte: to }, status: { not: 'VOID' }, taxAdd: { gt: 0 } },
    select: { id: true, number: true, date: true, taxInvoiceNo: true, subtotal: true, discount: true, taxAdd: true, client: { select: { name: true, npwp: true } } },
    orderBy: { date: 'asc' },
  });
  return { rows, invoices };
}

/** PPh yang dipotong: oleh klien atas invoice (kredit pajak) dan oleh TQ atas tagihan vendor (wajib disetor). */
export async function withholdingRecap(period) {
  month(period);
  const { start, end } = monthRange(period);
  const [invoices, bills] = await Promise.all([
    prisma.invoice.findMany({ where: { date: { gte: start, lte: end }, status: { not: 'VOID' }, taxDeduct: { gt: 0 } }, select: { id: true, number: true, date: true, subtotal: true, discount: true, appliedTaxes: true, client: { select: { name: true, npwp: true } } }, orderBy: { date: 'asc' } }),
    prisma.bill.findMany({ where: { date: { gte: start, lte: end }, status: { not: 'VOID' }, taxDeduct: { gt: 0 } }, select: { id: true, number: true, vendorRef: true, date: true, subtotal: true, appliedTaxes: true, vendor: { select: { name: true, npwp: true } } }, orderBy: { date: 'asc' } }),
  ]);
  const flat = (doc, party) => doc.appliedTaxes.filter((t) => t.type === 'DEDUCTION').map((t) => ({ id: doc.id + t.taxId, docId: doc.id, number: doc.number, date: doc.date, party: party.name, npwp: party.npwp, base: round2(Number(doc.subtotal) - Number(doc.discount ?? 0)), tax: t.name, code: t.code, rate: t.rate, amount: t.amount }));
  const payables = await taxPayables();
  return { byClients: invoices.flatMap((i) => flat(i, i.client)), byUs: bills.flatMap((b) => flat(b, b.vendor)), payables };
}

/** Saldo akun hutang pajak (akun pembelian pajak potong + PPN keluaran). */
export async function taxPayables() {
  const taxes = await prisma.tax.findMany({ where: { isActive: true } });
  const ids = [...new Set(taxes.flatMap((t) => (t.type === 'DEDUCTION' ? [t.purchaseAccountId] : [t.salesAccountId])).filter(Boolean))];
  const accounts = await prisma.account.findMany({ where: { id: { in: ids }, type: 'LIABILITY' }, orderBy: { code: 'asc' } });
  const sums = await prisma.journalLine.groupBy({ by: ['accountId'], where: { accountId: { in: accounts.map((a) => a.id) } }, _sum: { debit: true, credit: true } });
  const bal = Object.fromEntries(sums.map((s) => [s.accountId, signed('CREDIT', s._sum.debit ?? 0, s._sum.credit ?? 0)]));
  return accounts.map((a) => ({ id: a.id, code: a.code, name: a.name, balance: round2(bal[a.id] ?? 0), taxCode: taxes.find((t) => t.purchaseAccountId === a.id || t.salesAccountId === a.id)?.code ?? null }));
}

export async function listTaxPayments(f = {}) {
  const where = {};
  if (f.year && /^\d{4}$/.test(f.year)) where.period = { startsWith: f.year };
  const rows = await prisma.taxPayment.findMany({ where, orderBy: [{ date: 'desc' }] });
  const accounts = await prisma.account.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => [r.taxAccountId, r.cashAccountId]))] } }, select: { id: true, code: true, name: true } });
  const name = Object.fromEntries(accounts.map((a) => [a.id, `${a.code} ${a.name}`]));
  return rows.map((r) => ({ ...r, taxAccount: name[r.taxAccountId], cashAccount: name[r.cashAccountId] }));
}

export async function createTaxPayment(user, body) {
  object(body, ['taxCode', 'period', 'date', 'cashAccountId', 'taxAccountId', 'amount', 'billingCode', 'ntpn', 'notes']);
  const v = {
    taxCode: text(body.taxCode, 'Jenis pajak', 20).toUpperCase(),
    period: month(body.period),
    date: date(body.date, 'Tanggal setor'),
    cashAccountId: idOf(body.cashAccountId, 'Akun kas/bank'),
    taxAccountId: idOf(body.taxAccountId, 'Akun hutang pajak'),
    amount: number(body.amount, 'Nominal setor', 1),
    billingCode: text(body.billingCode, 'Kode billing', 30, true),
    ntpn: text(body.ntpn, 'NTPN', 30, true),
    notes: text(body.notes, 'Catatan', 300, true),
  };
  const [cash, taxAcc] = await Promise.all([prisma.account.findUnique({ where: { id: v.cashAccountId } }), prisma.account.findUnique({ where: { id: v.taxAccountId } })]);
  ensure(cash?.isCash, 'Pilih akun kas/bank.');
  ensure(taxAcc && !taxAcc.isGroup && ['LIABILITY', 'EXPENSE', 'INCOME_TAX', 'ASSET'].includes(taxAcc.type), 'Akun pajak tidak valid.');
  return prisma.$transaction(async (tx) => {
    const number = await docNumber(tx, 'TAX', v.date);
    const desc = `Setor ${v.taxCode} masa ${v.period}${v.ntpn ? ' NTPN ' + v.ntpn : ''}`;
    const j = await postJournal(tx, user, {
      date: v.date, description: desc, reference: v.billingCode ?? number, source: 'TAX_PAYMENT',
      lines: [{ accountId: v.taxAccountId, debit: v.amount, credit: 0, description: desc }, { accountId: v.cashAccountId, debit: 0, credit: v.amount, description: desc }],
    });
    const row = await tx.taxPayment.create({ data: { ...v, number, journalId: j.id, createdBy: user.id } });
    await tx.journal.update({ where: { id: j.id }, data: { sourceId: row.id } });
    await audit(tx, user, { action: 'CREATE', module: 'tax', recordId: row.id, after: { number, ...v } });
    return row;
  });
}

export async function deleteTaxPayment(user, id) {
  const row = await prisma.taxPayment.findUnique({ where: { id } });
  ensure(row, 'Setoran tidak ditemukan.', 404);
  return prisma.$transaction(async (tx) => {
    await removeJournal(tx, row.journalId);
    await tx.taxPayment.delete({ where: { id } });
    await audit(tx, user, { action: 'DELETE', module: 'tax', recordId: id, before: row });
    return { ok: true };
  });
}
