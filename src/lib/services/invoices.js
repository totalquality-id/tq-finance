import { prisma } from '../prisma.js';
import { actorName, audit } from '../audit.js';
import { addDays, today } from '../dates.js';
import { computeDocument, paymentStatus, round2 } from '../domain/accounting.js';
import { array, date, ensure, id as idOf, number, object, optionalId, text } from '../validation.js';
import { searchOr } from './common.js';
import { accountMapping, assertOpen, docNumber, postJournal, removeJournal, replaceJournal } from './ledger.js';

export const INVOICE_STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'VOID'];

/** Pajak aktif yang dipilih untuk dokumen; kind = 'SALES' | 'PURCHASE'. */
export async function loadTaxes(db, ids, kind) {
  if (!ids?.length) return [];
  ensure(Array.isArray(ids) && ids.length <= 10, 'Daftar pajak tidak valid.');
  const rows = await db.tax.findMany({ where: { id: { in: ids }, isActive: true, appliesTo: { in: [kind, 'BOTH'] } } });
  ensure(rows.length === new Set(ids).size, 'Pajak tidak ditemukan atau tidak berlaku.');
  return rows.map((t) => {
    const accountId = kind === 'SALES' ? t.salesAccountId : t.purchaseAccountId;
    ensure(accountId, `Akun untuk pajak ${t.name} belum diatur.`);
    return { taxId: t.id, code: t.code, name: t.name, rate: Number(t.rate), type: t.type, accountId };
  });
}

export function parseItems(list, { withAccount = false } = {}) {
  return array(list, 'Rincian', 100).map((it, i) => ({
    description: text(it.description, `Uraian baris ${i + 1}`, 300),
    quantity: number(it.quantity ?? 1, `Kuantitas baris ${i + 1}`, 0.0001, 1e7),
    unit: text(it.unit, 'Satuan', 20, true) ?? 'paket',
    unitPrice: number(it.unitPrice, `Harga baris ${i + 1}`, 0),
    ...(withAccount ? { accountId: idOf(it.accountId, `Akun baris ${i + 1}`) } : {}),
  }));
}

export async function listInvoices(f = {}, { skip = 0, take = 50 } = {}) {
  const where = {};
  if (f.status === 'OVERDUE') { where.status = { in: ['UNPAID', 'PARTIAL'] }; where.dueDate = { lt: today() }; }
  else if (INVOICE_STATUSES.includes(f.status)) where.status = f.status;
  else if (f.status === 'OPEN') where.status = { in: ['UNPAID', 'PARTIAL'] };
  if (f.clientId) where.clientId = String(f.clientId);
  if (f.projectId) where.projectId = String(f.projectId);
  if (f.from || f.to) where.date = { ...(f.from ? { gte: date(f.from) } : {}), ...(f.to ? { lte: date(f.to) } : {}) };
  const or = searchOr(f.q, ['number', 'reference', 'taxInvoiceNo', 'client.name', 'project.name']);
  if (or) where.OR = or;
  const [rows, total, sums] = await Promise.all([
    prisma.invoice.findMany({
      where, skip, take, orderBy: [{ date: 'desc' }, { number: 'desc' }],
      include: {
        client: { select: { id: true, name: true, code: true, npwp: true, address: true, city: true, pic: true } },
        project: { select: { id: true, code: true, name: true } },
        payments: { orderBy: { date: 'asc' } },
        milestone: { select: { id: true, name: true } },
      },
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.aggregate({ where: { ...where, status: where.status ?? { not: 'VOID' } }, _sum: { total: true, paid: true } }),
  ]);
  return { rows, total, sumTotal: Number(sums._sum.total ?? 0), sumPaid: Number(sums._sum.paid ?? 0) };
}

async function parse(db, body) {
  object(body, ['clientId', 'projectId', 'milestoneId', 'date', 'dueDate', 'reference', 'taxInvoiceNo', 'items', 'discount', 'taxIds', 'revenueAccountId', 'notes']);
  const v = {
    clientId: idOf(body.clientId, 'Copart'),
    projectId: optionalId(body.projectId, 'Proyek'),
    milestoneId: optionalId(body.milestoneId, 'Termin'),
    date: date(body.date, 'Tanggal invoice'),
    dueDate: date(body.dueDate, 'Jatuh tempo'),
    reference: text(body.reference, 'No. PO/SPK', 80, true),
    taxInvoiceNo: text(body.taxInvoiceNo, 'No. faktur pajak', 40, true),
    notes: text(body.notes, 'Catatan', 1000, true),
  };
  ensure(v.dueDate >= v.date, 'Jatuh tempo tidak boleh sebelum tanggal invoice.');
  ensure(await db.contact.count({ where: { id: v.clientId, type: 'CLIENT' } }), 'Copart tidak ditemukan.');
  if (v.projectId) {
    const p = await db.project.findUnique({ where: { id: v.projectId }, select: { clientId: true } });
    ensure(p, 'Proyek tidak ditemukan.');
    ensure(p.clientId === v.clientId, 'Proyek bukan milik Copart yang dipilih.');
  }
  const items = parseItems(body.items);
  const taxes = await loadTaxes(db, body.taxIds, 'SALES');
  let doc;
  try { doc = computeDocument({ items, discount: Number(body.discount || 0), taxes }); } catch (e) { ensure(false, e.message); }
  ensure(doc.total > 0, 'Total invoice harus lebih dari nol.');
  const map = await accountMapping(db);
  const revenueAccountId = optionalId(body.revenueAccountId, 'Akun pendapatan') ?? map.revenue?.id;
  ensure(revenueAccountId, 'Akun pendapatan belum dipetakan.');
  ensure(map.receivable, 'Akun piutang usaha belum dipetakan di Pengaturan.');
  if (doc.discount > 0) ensure(map.salesDiscount, 'Akun potongan penjualan belum dipetakan.');
  return { v, doc, revenueAccountId, receivableAccountId: map.receivable.id, discountAccountId: map.salesDiscount?.id };
}

function invoiceLines({ v, doc, revenueAccountId, receivableAccountId, discountAccountId }, number, clientName) {
  const desc = `Invoice ${number} — ${clientName}`;
  const p = v.projectId;
  return [
    { accountId: receivableAccountId, debit: doc.total, credit: 0, description: desc },
    ...(doc.discount > 0 ? [{ accountId: discountAccountId, projectId: p, debit: doc.discount, credit: 0, description: 'Potongan ' + number }] : []),
    { accountId: revenueAccountId, projectId: p, debit: 0, credit: doc.subtotal, description: desc },
    ...doc.appliedTaxes.filter((t) => t.amount > 0).map((t) => (t.type === 'ADDITION'
      ? { accountId: t.accountId, debit: 0, credit: t.amount, description: `${t.name} ${number}` }
      : { accountId: t.accountId, debit: t.amount, credit: 0, description: `${t.name} ${number}` })),
  ];
}

function docData(p) {
  return {
    clientId: p.v.clientId, projectId: p.v.projectId, date: p.v.date, dueDate: p.v.dueDate, reference: p.v.reference, taxInvoiceNo: p.v.taxInvoiceNo, notes: p.v.notes,
    items: p.doc.items, subtotal: p.doc.subtotal, discount: p.doc.discount, appliedTaxes: p.doc.appliedTaxes, taxAdd: p.doc.taxAdd, taxDeduct: p.doc.taxDeduct, total: p.doc.total,
    revenueAccountId: p.revenueAccountId, receivableAccountId: p.receivableAccountId,
  };
}

export async function createInvoice(user, body) {
  const p = await parse(prisma, body);
  const client = await prisma.contact.findUnique({ where: { id: p.v.clientId }, select: { name: true } });
  return prisma.$transaction(async (tx) => {
    if (p.v.milestoneId) {
      const m = await tx.projectMilestone.findUnique({ where: { id: p.v.milestoneId } });
      ensure(m && m.projectId === p.v.projectId, 'Termin tidak sesuai proyek.');
      ensure(!m.invoiceId, 'Termin ini sudah diinvoice.');
    }
    const number = await docNumber(tx, 'INVOICE', p.v.date);
    const j = await postJournal(tx, user, { date: p.v.date, description: `Invoice ${number} — ${client.name}`, reference: number, source: 'INVOICE', lines: invoiceLines(p, number, client.name) });
    const row = await tx.invoice.create({ data: { ...docData(p), number, journalId: j.id, createdBy: user.id, creatorName: actorName(user) } });
    await tx.journal.update({ where: { id: j.id }, data: { sourceId: row.id } });
    if (p.v.milestoneId) await tx.projectMilestone.update({ where: { id: p.v.milestoneId }, data: { invoiceId: row.id } });
    await audit(tx, user, { action: 'CREATE', module: 'invoices', recordId: row.id, after: { number, client: client.name, total: p.doc.total } });
    return row;
  }, { timeout: 20000 });
}

export async function updateInvoice(user, id, body) {
  const before = await prisma.invoice.findUnique({ where: { id }, include: { payments: true, milestone: true } });
  ensure(before, 'Invoice tidak ditemukan.', 404);
  ensure(before.status !== 'VOID', 'Invoice sudah dibatalkan.', 409);
  ensure(!before.payments.length, 'Invoice sudah memiliki pembayaran. Hapus pembayaran terlebih dahulu untuk mengubah.', 409);
  const p = await parse(prisma, { ...body, milestoneId: undefined });
  const client = await prisma.contact.findUnique({ where: { id: p.v.clientId }, select: { name: true } });
  return prisma.$transaction(async (tx) => {
    await replaceJournal(tx, before.journalId, { date: p.v.date, description: `Invoice ${before.number} — ${client.name}`, reference: before.number, lines: invoiceLines(p, before.number, client.name) });
    const row = await tx.invoice.update({ where: { id }, data: docData(p) });
    if (before.milestone && before.projectId !== p.v.projectId) await tx.projectMilestone.update({ where: { id: before.milestone.id }, data: { invoiceId: null } });
    await audit(tx, user, { action: 'UPDATE', module: 'invoices', recordId: id, before: { total: before.total, date: before.date, clientId: before.clientId }, after: { total: p.doc.total, date: p.v.date, clientId: p.v.clientId } });
    return row;
  }, { timeout: 20000 });
}

export async function voidInvoice(user, id, body) {
  object(body, ['reason']);
  const reason = text(body.reason, 'Alasan pembatalan', 300);
  const inv = await prisma.invoice.findUnique({ where: { id }, include: { payments: true, milestone: true } });
  ensure(inv, 'Invoice tidak ditemukan.', 404);
  ensure(inv.status !== 'VOID', 'Invoice sudah dibatalkan.', 409);
  ensure(!inv.payments.length, 'Hapus pembayaran invoice terlebih dahulu.', 409);
  return prisma.$transaction(async (tx) => {
    await removeJournal(tx, inv.journalId);
    await tx.invoice.update({ where: { id }, data: { status: 'VOID', voidReason: reason, journalId: null } });
    if (inv.milestone) await tx.projectMilestone.update({ where: { id: inv.milestone.id }, data: { invoiceId: null } });
    await audit(tx, user, { action: 'VOID', module: 'invoices', recordId: id, before: { status: inv.status, total: inv.total }, note: reason });
    return { ok: true };
  });
}

export async function addInvoicePayment(user, id, body) {
  object(body, ['date', 'cashAccountId', 'amount', 'bankFee', 'notes']);
  const v = {
    date: date(body.date, 'Tanggal terima'),
    cashAccountId: idOf(body.cashAccountId, 'Akun kas/bank'),
    amount: number(body.amount, 'Nominal diterima', 0.01),
    bankFee: number(body.bankFee ?? 0, 'Biaya bank', 0),
    notes: text(body.notes, 'Catatan', 300, true),
  };
  const inv = await prisma.invoice.findUnique({ where: { id }, include: { client: { select: { name: true } } } });
  ensure(inv, 'Invoice tidak ditemukan.', 404);
  ensure(['UNPAID', 'PARTIAL'].includes(inv.status), 'Invoice tidak dalam status terbuka.', 409);
  const remaining = round2(Number(inv.total) - Number(inv.paid));
  ensure(v.amount <= remaining + 0.005, `Nominal melebihi sisa piutang (${remaining}).`);
  ensure(v.bankFee < v.amount, 'Biaya bank harus lebih kecil dari nominal.');
  ensure(v.date >= inv.date, 'Tanggal terima sebelum tanggal invoice.');
  const cash = await prisma.account.findUnique({ where: { id: v.cashAccountId } });
  ensure(cash?.isCash, 'Pilih akun kas/bank.');
  const map = await accountMapping();
  if (v.bankFee > 0) ensure(map.bankFee, 'Akun beban administrasi bank belum dipetakan.');
  return prisma.$transaction(async (tx) => {
    const number = await docNumber(tx, 'RECEIPT', v.date);
    const desc = `Penerimaan ${inv.number} — ${inv.client.name}`;
    const j = await postJournal(tx, user, {
      date: v.date, description: desc, reference: inv.number, source: 'INVOICE_PAYMENT', sourceId: inv.id,
      lines: [
        { accountId: v.cashAccountId, debit: round2(v.amount - v.bankFee), credit: 0, description: desc },
        ...(v.bankFee > 0 ? [{ accountId: map.bankFee.id, debit: v.bankFee, credit: 0, description: 'Biaya transfer ' + inv.number }] : []),
        { accountId: inv.receivableAccountId, debit: 0, credit: v.amount, description: desc },
      ],
    });
    const pay = await tx.invoicePayment.create({ data: { invoiceId: id, number, ...v, journalId: j.id, createdBy: user.id } });
    const paid = round2(Number(inv.paid) + v.amount);
    await tx.invoice.update({ where: { id }, data: { paid, status: paymentStatus(inv.total, paid) } });
    await audit(tx, user, { action: 'CREATE', module: 'invoices', recordId: id, after: { payment: number, amount: v.amount }, note: 'Penerimaan pembayaran' });
    return pay;
  });
}

export async function deleteInvoicePayment(user, paymentId) {
  const pay = await prisma.invoicePayment.findUnique({ where: { id: paymentId }, include: { invoice: true } });
  ensure(pay, 'Pembayaran tidak ditemukan.', 404);
  await assertOpen(prisma, pay.date);
  return prisma.$transaction(async (tx) => {
    await removeJournal(tx, pay.journalId);
    await tx.invoicePayment.delete({ where: { id: paymentId } });
    const paid = round2(Number(pay.invoice.paid) - Number(pay.amount));
    await tx.invoice.update({ where: { id: pay.invoiceId }, data: { paid, status: paymentStatus(pay.invoice.total, paid) } });
    await audit(tx, user, { action: 'DELETE', module: 'invoices', recordId: pay.invoiceId, before: { payment: pay.number, amount: pay.amount }, note: 'Hapus pembayaran' });
    return { ok: true };
  });
}

/** Usulan jatuh tempo dari termin klien. */
export const suggestDue = (d, days) => addDays(d, days ?? 30);
