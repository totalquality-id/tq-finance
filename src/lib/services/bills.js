import { prisma } from '../prisma.js';
import { actorName, audit } from '../audit.js';
import { today } from '../dates.js';
import { computeDocument, paymentStatus, round2 } from '../domain/accounting.js';
import { date, ensure, id as idOf, number, object, optionalId, text } from '../validation.js';
import { searchOr } from './common.js';
import { accountMapping, assertOpen, docNumber, postJournal, removeJournal, replaceJournal } from './ledger.js';
import { INVOICE_STATUSES, loadTaxes, parseItems } from './invoices.js';

export async function listBills(f = {}, { skip = 0, take = 50 } = {}) {
  const where = {};
  if (f.status === 'OVERDUE') { where.status = { in: ['UNPAID', 'PARTIAL'] }; where.dueDate = { lt: today() }; }
  else if (f.status === 'OPEN') where.status = { in: ['UNPAID', 'PARTIAL'] };
  else if (INVOICE_STATUSES.includes(f.status)) where.status = f.status;
  if (f.vendorId) where.vendorId = String(f.vendorId);
  if (f.projectId) where.projectId = String(f.projectId);
  if (f.from || f.to) where.date = { ...(f.from ? { gte: date(f.from) } : {}), ...(f.to ? { lte: date(f.to) } : {}) };
  const or = searchOr(f.q, ['number', 'vendorRef', 'vendor.name', 'project.name']);
  if (or) where.OR = or;
  const [rows, total, sums] = await Promise.all([
    prisma.bill.findMany({
      where, skip, take, orderBy: [{ date: 'desc' }, { number: 'desc' }],
      include: { vendor: { select: { id: true, name: true, code: true, bankName: true, bankAccount: true, bankHolder: true } }, project: { select: { id: true, code: true, name: true } }, payments: { orderBy: { date: 'asc' } } },
    }),
    prisma.bill.count({ where }),
    prisma.bill.aggregate({ where: { ...where, status: where.status ?? { not: 'VOID' } }, _sum: { total: true, paid: true } }),
  ]);
  return { rows, total, sumTotal: Number(sums._sum.total ?? 0), sumPaid: Number(sums._sum.paid ?? 0) };
}

async function parse(db, body) {
  object(body, ['vendorId', 'projectId', 'vendorRef', 'date', 'dueDate', 'items', 'taxIds', 'notes']);
  const v = {
    vendorId: idOf(body.vendorId, 'Vendor'),
    projectId: optionalId(body.projectId, 'Proyek'),
    vendorRef: text(body.vendorRef, 'No. tagihan vendor', 80, true),
    date: date(body.date, 'Tanggal tagihan'),
    dueDate: date(body.dueDate, 'Jatuh tempo'),
    notes: text(body.notes, 'Catatan', 1000, true),
  };
  ensure(v.dueDate >= v.date, 'Jatuh tempo tidak boleh sebelum tanggal tagihan.');
  ensure(await db.contact.count({ where: { id: v.vendorId, type: { in: ['VENDOR', 'ASSOCIATE'] } } }), 'Vendor tidak ditemukan.');
  if (v.projectId) ensure(await db.project.count({ where: { id: v.projectId } }), 'Proyek tidak ditemukan.');
  const items = parseItems(body.items, { withAccount: true });
  const taxes = await loadTaxes(db, body.taxIds, 'PURCHASE');
  const doc = computeDocument({ items, taxes });
  ensure(doc.total > 0, 'Total tagihan harus lebih dari nol.');
  const map = await accountMapping(db);
  ensure(map.payable, 'Akun hutang usaha belum dipetakan di Pengaturan.');
  return { v, doc, payableAccountId: map.payable.id };
}

function billLines({ v, doc, payableAccountId }, number, vendorName) {
  const desc = `Tagihan ${number} — ${vendorName}`;
  return [
    ...doc.items.map((it) => ({ accountId: it.accountId, projectId: v.projectId, debit: it.total, credit: 0, description: it.description })),
    ...doc.appliedTaxes.filter((t) => t.amount > 0).map((t) => (t.type === 'ADDITION'
      ? { accountId: t.accountId, debit: t.amount, credit: 0, description: `${t.name} ${number}` }
      : { accountId: t.accountId, debit: 0, credit: t.amount, description: `${t.name} ${number} — ${vendorName}` })),
    { accountId: payableAccountId, debit: 0, credit: doc.total, description: desc },
  ];
}

const docData = (p) => ({
  vendorId: p.v.vendorId, projectId: p.v.projectId, vendorRef: p.v.vendorRef, date: p.v.date, dueDate: p.v.dueDate, notes: p.v.notes,
  items: p.doc.items, subtotal: p.doc.subtotal, appliedTaxes: p.doc.appliedTaxes, taxAdd: p.doc.taxAdd, taxDeduct: p.doc.taxDeduct, total: p.doc.total, payableAccountId: p.payableAccountId,
});

export async function createBill(user, body) {
  const p = await parse(prisma, body);
  const vendor = await prisma.contact.findUnique({ where: { id: p.v.vendorId }, select: { name: true } });
  return prisma.$transaction(async (tx) => {
    const number = await docNumber(tx, 'BILL', p.v.date);
    const j = await postJournal(tx, user, { date: p.v.date, description: `Tagihan ${number} — ${vendor.name}`, reference: p.v.vendorRef ?? number, source: 'BILL', lines: billLines(p, number, vendor.name) });
    const row = await tx.bill.create({ data: { ...docData(p), number, journalId: j.id, createdBy: user.id, creatorName: actorName(user) } });
    await tx.journal.update({ where: { id: j.id }, data: { sourceId: row.id } });
    await audit(tx, user, { action: 'CREATE', module: 'bills', recordId: row.id, after: { number, vendor: vendor.name, total: p.doc.total } });
    return row;
  }, { timeout: 20000 });
}

export async function updateBill(user, id, body) {
  const before = await prisma.bill.findUnique({ where: { id }, include: { payments: true } });
  ensure(before, 'Tagihan tidak ditemukan.', 404);
  ensure(before.status !== 'VOID', 'Tagihan sudah dibatalkan.', 409);
  ensure(!before.payments.length, 'Tagihan sudah dibayar sebagian/lunas. Hapus pembayaran terlebih dahulu untuk mengubah.', 409);
  const p = await parse(prisma, body);
  const vendor = await prisma.contact.findUnique({ where: { id: p.v.vendorId }, select: { name: true } });
  return prisma.$transaction(async (tx) => {
    await replaceJournal(tx, before.journalId, { date: p.v.date, description: `Tagihan ${before.number} — ${vendor.name}`, reference: p.v.vendorRef ?? before.number, lines: billLines(p, before.number, vendor.name) });
    const row = await tx.bill.update({ where: { id }, data: docData(p) });
    await audit(tx, user, { action: 'UPDATE', module: 'bills', recordId: id, before: { total: before.total, date: before.date }, after: { total: p.doc.total, date: p.v.date } });
    return row;
  }, { timeout: 20000 });
}

export async function voidBill(user, id, body) {
  object(body, ['reason']);
  const reason = text(body.reason, 'Alasan pembatalan', 300);
  const bill = await prisma.bill.findUnique({ where: { id }, include: { payments: true } });
  ensure(bill, 'Tagihan tidak ditemukan.', 404);
  ensure(bill.status !== 'VOID', 'Tagihan sudah dibatalkan.', 409);
  ensure(!bill.payments.length, 'Hapus pembayaran tagihan terlebih dahulu.', 409);
  return prisma.$transaction(async (tx) => {
    await removeJournal(tx, bill.journalId);
    await tx.bill.update({ where: { id }, data: { status: 'VOID', voidReason: reason, journalId: null } });
    await audit(tx, user, { action: 'VOID', module: 'bills', recordId: id, before: { status: bill.status, total: bill.total }, note: reason });
    return { ok: true };
  });
}

export async function addBillPayment(user, id, body) {
  object(body, ['date', 'cashAccountId', 'amount', 'notes']);
  const v = {
    date: date(body.date, 'Tanggal bayar'),
    cashAccountId: idOf(body.cashAccountId, 'Akun kas/bank'),
    amount: number(body.amount, 'Nominal dibayar', 0.01),
    notes: text(body.notes, 'Catatan', 300, true),
  };
  const bill = await prisma.bill.findUnique({ where: { id }, include: { vendor: { select: { name: true } } } });
  ensure(bill, 'Tagihan tidak ditemukan.', 404);
  ensure(['UNPAID', 'PARTIAL'].includes(bill.status), 'Tagihan tidak dalam status terbuka.', 409);
  const remaining = round2(Number(bill.total) - Number(bill.paid));
  ensure(v.amount <= remaining + 0.005, `Nominal melebihi sisa hutang (${remaining}).`);
  ensure(v.date >= bill.date, 'Tanggal bayar sebelum tanggal tagihan.');
  const cash = await prisma.account.findUnique({ where: { id: v.cashAccountId } });
  ensure(cash?.isCash, 'Pilih akun kas/bank.');
  return prisma.$transaction(async (tx) => {
    const number = await docNumber(tx, 'PAYMENT', v.date);
    const desc = `Pembayaran ${bill.number} — ${bill.vendor.name}`;
    const j = await postJournal(tx, user, {
      date: v.date, description: desc, reference: bill.vendorRef ?? bill.number, source: 'BILL_PAYMENT', sourceId: bill.id,
      lines: [
        { accountId: bill.payableAccountId, debit: v.amount, credit: 0, description: desc },
        { accountId: v.cashAccountId, debit: 0, credit: v.amount, description: desc },
      ],
    });
    const pay = await tx.billPayment.create({ data: { billId: id, number, ...v, journalId: j.id, createdBy: user.id } });
    const paid = round2(Number(bill.paid) + v.amount);
    await tx.bill.update({ where: { id }, data: { paid, status: paymentStatus(bill.total, paid) } });
    await audit(tx, user, { action: 'CREATE', module: 'bills', recordId: id, after: { payment: number, amount: v.amount }, note: 'Pembayaran tagihan' });
    return pay;
  });
}

export async function deleteBillPayment(user, paymentId) {
  const pay = await prisma.billPayment.findUnique({ where: { id: paymentId }, include: { bill: true } });
  ensure(pay, 'Pembayaran tidak ditemukan.', 404);
  await assertOpen(prisma, pay.date);
  return prisma.$transaction(async (tx) => {
    await removeJournal(tx, pay.journalId);
    await tx.billPayment.delete({ where: { id: paymentId } });
    const paid = round2(Number(pay.bill.paid) - Number(pay.amount));
    await tx.bill.update({ where: { id: pay.billId }, data: { paid, status: paymentStatus(pay.bill.total, paid) } });
    await audit(tx, user, { action: 'DELETE', module: 'bills', recordId: pay.billId, before: { payment: pay.number, amount: pay.amount }, note: 'Hapus pembayaran' });
    return { ok: true };
  });
}
