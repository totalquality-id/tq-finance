import * as XLSX from 'xlsx';
import { prisma } from '../prisma.js';
import { actorName, audit } from '../audit.js';
import { addDays, iso, today } from '../dates.js';
import {
  CATEGORIES, DOC_TYPES, FOLLOW_UP_CHANNELS, LAYOUTS, SEND_CHANNELS, SERIES, TAX_MODES,
  computeInvoice, formatInvoiceNumber, nextFollowUp, paymentStatus, round2, suggestShortCode,
} from '../domain/billing.js';
import { labelOf } from '../labels.js';
import { getSettings } from '../settings.js';
import { seriesKey, sequenceKey } from '../settings-defaults.js';
import { array, choice, date, ensure, id as idOf, int, number, object, optionalDate, optionalId, text } from '../validation.js';
import { searchOr } from './common.js';

export const INVOICE_STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'VOID'];
const OPEN = ['UNPAID', 'PARTIAL'];

const INCLUDE = {
  client: { select: { id: true, name: true, code: true, shortCode: true, npwp: true, address: true, city: true, pic: true, email: true, phone: true } },
  project: { select: { id: true, code: true, name: true, contractNo: true } },
  payments: { orderBy: { date: 'asc' } },
  followUps: { orderBy: { date: 'desc' } },
  milestone: { select: { id: true, name: true } },
};

/** Status penagihan turunan untuk tampilan: belum dikirim / terkirim / perlu follow up. */
function billingState(inv, followUpDays, now = today()) {
  if (!OPEN.includes(inv.status)) return { state: null, nextFollowUpAt: null };
  if (!inv.sentAt) return { state: 'NOT_SENT', nextFollowUpAt: null };
  const last = inv.followUps?.[0];
  const next = nextFollowUp({ sentAt: inv.sentAt, lastFollowUp: last?.date, promiseDate: last?.promiseDate }, followUpDays);
  return { state: next && next <= now ? 'FOLLOW_UP' : 'SENT', nextFollowUpAt: next };
}

export async function listInvoices(f = {}, { skip = 0, take = 50 } = {}) {
  const now = today();
  const where = {};
  if (f.status === 'OVERDUE') { where.status = { in: OPEN }; where.dueDate = { lt: now }; }
  else if (f.status === 'OPEN') where.status = { in: OPEN };
  else if (f.status === 'NOT_SENT') { where.status = { in: OPEN }; where.sentAt = null; }
  else if (INVOICE_STATUSES.includes(f.status)) where.status = f.status;
  if (SERIES.includes(f.series)) where.series = f.series;
  if (CATEGORIES.includes(f.category)) where.category = f.category;
  if (f.clientId) where.clientId = String(f.clientId);
  if (f.projectId) where.projectId = String(f.projectId);
  if (f.from || f.to) where.date = { ...(f.from ? { gte: date(f.from) } : {}), ...(f.to ? { lte: date(f.to) } : {}) };
  const or = searchOr(f.q, ['number', 'reference', 'taxInvoiceNo', 'subject', 'client.name', 'project.name']);
  if (or) where.OR = or;
  const { 'reminder.thresholds': th } = await getSettings(['reminder.thresholds']);
  let rows, total;
  if (f.status === 'FOLLOW_UP') {
    // Disaring setelah dihitung karena bergantung pada riwayat follow up.
    const all = await prisma.invoice.findMany({ where: { ...where, status: { in: OPEN }, sentAt: { not: null } }, orderBy: [{ dueDate: 'asc' }], include: INCLUDE });
    const due = all.map((r) => ({ ...r, ...billingState(r, th.followUpDays, now) })).filter((r) => r.state === 'FOLLOW_UP');
    rows = due.slice(skip, skip + take); total = due.length;
  } else {
    [rows, total] = await Promise.all([
      prisma.invoice.findMany({ where, skip, take, orderBy: [{ date: 'desc' }, { seq: 'desc' }], include: INCLUDE }),
      prisma.invoice.count({ where }),
    ]);
    rows = rows.map((r) => ({ ...r, ...billingState(r, th.followUpDays, now) }));
  }
  const sums = await prisma.invoice.aggregate({ where: { ...where, ...(where.status ? {} : { status: { not: 'VOID' } }) }, _sum: { total: true, paid: true } });
  return { rows, total, sumTotal: Number(sums._sum.total ?? 0), sumPaid: Number(sums._sum.paid ?? 0) };
}

export async function getInvoice(id) {
  const inv = await prisma.invoice.findUnique({ where: { id }, include: INCLUDE });
  ensure(inv, 'Invoice tidak ditemukan.', 404);
  return inv;
}

function parseItems(list, layout) {
  return array(list, 'Rincian', 60).map((it, i) => ({
    description: text(it.description, layout === 'TIKET' ? `Nama penumpang baris ${i + 1}` : `Deskripsi baris ${i + 1}`, 400),
    detail: text(it.detail, 'Keterangan', 400, true),
    route: layout === 'TIKET' ? text(it.route, `Rute baris ${i + 1}`, 120, true) : null,
    ref: layout === 'TIKET' ? text(it.ref, `Ref. number baris ${i + 1}`, 60, true) : null,
    amount: number(it.amount, `Jumlah baris ${i + 1}`, 0),
  }));
}

async function parse(db, body) {
  object(body, ['series', 'docType', 'category', 'layout', 'clientId', 'projectId', 'milestoneId', 'date', 'dueDate', 'attn', 'reference', 'subject', 'taxInvoiceNo', 'items', 'taxMode', 'notes', 'internalNote', 'seq']);
  const v = {
    series: choice(body.series, SERIES, 'Seri invoice'),
    docType: choice(body.docType ?? 'INVOICE', DOC_TYPES, 'Jenis dokumen'),
    category: choice(body.category ?? 'KONTRAK', CATEGORIES, 'Kategori'),
    layout: choice(body.layout ?? 'JASA', LAYOUTS, 'Format rincian'),
    clientId: idOf(body.clientId, 'Copart'),
    projectId: optionalId(body.projectId, 'Kontrak'),
    milestoneId: optionalId(body.milestoneId, 'Termin'),
    date: date(body.date, 'Tanggal'),
    dueDate: date(body.dueDate, 'Jatuh tempo'),
    attn: text(body.attn, 'Attn.', 150, true),
    reference: text(body.reference, 'No. PO / SPK', 80, true),
    subject: text(body.subject, 'Judul rincian', 200, true),
    taxInvoiceNo: text(body.taxInvoiceNo, 'No. faktur pajak', 40, true),
    notes: text(body.notes, 'Catatan', 1000, true),
    internalNote: text(body.internalNote, 'Catatan internal', 1000, true),
    seq: body.seq === undefined || body.seq === null || body.seq === '' ? null : int(body.seq, 'Nomor urut', 1, 999999),
  };
  ensure(v.dueDate >= v.date, 'Jatuh tempo tidak boleh sebelum tanggal invoice.');
  const client = await db.contact.findUnique({ where: { id: v.clientId }, select: { name: true, shortCode: true, type: true } });
  ensure(client && client.type === 'CLIENT', 'Copart tidak ditemukan.');
  if (v.projectId) {
    const p = await db.project.findUnique({ where: { id: v.projectId }, select: { clientId: true } });
    ensure(p, 'Kontrak tidak ditemukan.');
    ensure(p.clientId === v.clientId, 'Kontrak bukan milik Copart yang dipilih.');
  }
  const { 'invoice.document': doc } = await getSettings(['invoice.document'], db);
  const calc = computeInvoice({ items: parseItems(body.items, v.layout), series: v.series, taxMode: choice(body.taxMode ?? 'NONE', TAX_MODES, 'PPN'), ppnRate: doc.ppnRate });
  ensure(calc.total > 0, 'Total invoice harus lebih dari nol.');
  return { v, calc, shortCode: client.shortCode || suggestShortCode(client.name), clientName: client.name };
}

/** Ambil nomor urut berikutnya; mulai dari "Nomor berikutnya" di Pengaturan bila belum pernah dipakai. */
async function takeSeq(tx, series, manual) {
  const key = sequenceKey(series);
  if (manual) {
    const row = await tx.sequence.findUnique({ where: { key } });
    if (!row || row.value < manual) await tx.sequence.upsert({ where: { key }, create: { key, value: manual }, update: { value: manual } });
    return manual;
  }
  const existing = await tx.sequence.findUnique({ where: { key } });
  if (!existing) {
    const { [seriesKey(series)]: cfg } = await getSettings([seriesKey(series)], tx);
    const start = Math.max(1, Number(cfg.nextNumber) || 1);
    await tx.sequence.create({ data: { key, value: start } });
    return start;
  }
  return (await tx.sequence.update({ where: { key }, data: { value: { increment: 1 } } })).value;
}

const docData = ({ v, calc }) => ({
  series: v.series, docType: v.docType, category: v.category, layout: v.layout, clientId: v.clientId, projectId: v.projectId,
  date: v.date, dueDate: v.dueDate, attn: v.attn, reference: v.reference, subject: v.subject, taxInvoiceNo: v.taxInvoiceNo,
  notes: v.notes, internalNote: v.internalNote,
  items: calc.items, taxMode: calc.taxMode, ppnRate: calc.ppnRate, subtotal: calc.subtotal, dpp: calc.dpp, ppn: calc.ppn, total: calc.total,
});

export async function createInvoice(user, body) {
  const p = await parse(prisma, body);
  return prisma.$transaction(async (tx) => {
    if (p.v.milestoneId) {
      const m = await tx.projectMilestone.findUnique({ where: { id: p.v.milestoneId } });
      ensure(m && m.projectId === p.v.projectId, 'Termin tidak sesuai kontrak.');
      ensure(!m.invoiceId, 'Termin ini sudah diinvoice.');
    }
    const seq = await takeSeq(tx, p.v.series, p.v.seq);
    ensure(!(await tx.invoice.findUnique({ where: { series_seq: { series: p.v.series, seq } } })), `Nomor ${seq} pada ${labelOf(p.v.series)} sudah dipakai.`);
    const number = formatInvoiceNumber(p.shortCode, seq, p.v.date);
    const row = await tx.invoice.create({ data: { ...docData(p), number, seq, createdBy: user.id, creatorName: actorName(user) } });
    if (p.v.milestoneId) await tx.projectMilestone.update({ where: { id: p.v.milestoneId }, data: { invoiceId: row.id } });
    await audit(tx, user, { action: 'CREATE', module: 'invoices', recordId: row.id, after: { number, series: p.v.series, copart: p.clientName, total: p.calc.total } });
    return row;
  }, { timeout: 20000 });
}

export async function updateInvoice(user, id, body) {
  const before = await prisma.invoice.findUnique({ where: { id }, include: { payments: true, milestone: true } });
  ensure(before, 'Invoice tidak ditemukan.', 404);
  ensure(before.status !== 'VOID', 'Invoice sudah dibatalkan.', 409);
  ensure(!before.payments.length, 'Invoice sudah memiliki pembayaran. Hapus pembayaran terlebih dahulu untuk mengubah.', 409);
  const p = await parse(prisma, { ...body, series: before.series, milestoneId: undefined, seq: undefined });
  // Nomor format lama (hasil impor, tanpa nomor urut) dipertahankan apa adanya.
  const number = before.seq ? formatInvoiceNumber(p.shortCode, before.seq, p.v.date) : before.number;
  return prisma.$transaction(async (tx) => {
    const row = await tx.invoice.update({ where: { id }, data: { ...docData(p), number } });
    if (before.milestone && before.projectId !== p.v.projectId) await tx.projectMilestone.update({ where: { id: before.milestone.id }, data: { invoiceId: null } });
    await audit(tx, user, { action: 'UPDATE', module: 'invoices', recordId: id, before: { number: before.number, total: before.total }, after: { number, total: p.calc.total } });
    return row;
  });
}

export async function voidInvoice(user, id, body) {
  object(body, ['reason']);
  const reason = text(body.reason, 'Alasan pembatalan', 300);
  const inv = await prisma.invoice.findUnique({ where: { id }, include: { payments: true, milestone: true } });
  ensure(inv, 'Invoice tidak ditemukan.', 404);
  ensure(inv.status !== 'VOID', 'Invoice sudah dibatalkan.', 409);
  ensure(!inv.payments.length, 'Hapus pembayaran invoice terlebih dahulu.', 409);
  return prisma.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id }, data: { status: 'VOID', voidReason: reason } });
    if (inv.milestone) await tx.projectMilestone.update({ where: { id: inv.milestone.id }, data: { invoiceId: null } });
    await audit(tx, user, { action: 'VOID', module: 'invoices', recordId: id, before: { number: inv.number, total: inv.total }, note: reason });
    return { ok: true };
  });
}

export async function markSent(user, id, body) {
  object(body, ['sentAt', 'sentVia', 'sentNote']);
  const inv = await prisma.invoice.findUnique({ where: { id } });
  ensure(inv && inv.status !== 'VOID', 'Invoice tidak ditemukan.', 404);
  const data = { sentAt: date(body.sentAt, 'Tanggal kirim'), sentVia: choice(body.sentVia, SEND_CHANNELS, 'Dikirim via'), sentNote: text(body.sentNote, 'Keterangan', 300, true) };
  ensure(data.sentAt >= inv.date, 'Tanggal kirim sebelum tanggal invoice.');
  return prisma.$transaction(async (tx) => {
    const row = await tx.invoice.update({ where: { id }, data });
    await audit(tx, user, { action: 'SEND', module: 'invoices', recordId: id, after: { sentAt: iso(data.sentAt), via: data.sentVia } });
    return row;
  });
}

export async function addFollowUp(user, id, body) {
  object(body, ['date', 'channel', 'note', 'promiseDate']);
  const inv = await prisma.invoice.findUnique({ where: { id } });
  ensure(inv && OPEN.includes(inv.status), 'Invoice tidak dalam status terbuka.', 409);
  const data = {
    date: date(body.date, 'Tanggal follow up'),
    channel: choice(body.channel, FOLLOW_UP_CHANNELS, 'Melalui'),
    note: text(body.note, 'Hasil follow up', 1000),
    promiseDate: optionalDate(body.promiseDate, 'Janji bayar'),
  };
  return prisma.$transaction(async (tx) => {
    const row = await tx.invoiceFollowUp.create({ data: { ...data, invoiceId: id, createdBy: user.id, creatorName: actorName(user) } });
    await audit(tx, user, { action: 'FOLLOW_UP', module: 'invoices', recordId: id, after: { date: iso(data.date), channel: data.channel }, note: data.note.slice(0, 120) });
    return row;
  });
}

export async function addPayment(user, id, body) {
  object(body, ['date', 'account', 'amount', 'pph23', 'bankFee', 'buktiPotongNo', 'notes']);
  const v = {
    date: date(body.date, 'Tanggal terima'),
    account: choice(body.account, SERIES, 'Rekening'),
    amount: number(body.amount, 'Dana diterima', 0),
    pph23: number(body.pph23 ?? 0, 'PPh 23 dipotong', 0),
    bankFee: number(body.bankFee ?? 0, 'Biaya bank', 0),
    buktiPotongNo: text(body.buktiPotongNo, 'No. bukti potong', 60, true),
    notes: text(body.notes, 'Catatan', 300, true),
  };
  const settled = round2(v.amount + v.pph23 + v.bankFee);
  ensure(settled > 0, 'Isi nominal pembayaran.');
  const inv = await prisma.invoice.findUnique({ where: { id } });
  ensure(inv, 'Invoice tidak ditemukan.', 404);
  ensure(OPEN.includes(inv.status), 'Invoice tidak dalam status terbuka.', 409);
  const remaining = round2(Number(inv.total) - Number(inv.paid));
  ensure(settled <= remaining + 0.5, `Total pelunasan melebihi sisa tagihan (${remaining}).`);
  ensure(v.date >= inv.date, 'Tanggal terima sebelum tanggal invoice.');
  return prisma.$transaction(async (tx) => {
    const pay = await tx.invoicePayment.create({ data: { ...v, invoiceId: id, createdBy: user.id, creatorName: actorName(user) } });
    const paid = round2(Number(inv.paid) + settled);
    await tx.invoice.update({ where: { id }, data: { paid, status: paymentStatus(inv.total, paid) } });
    await audit(tx, user, { action: 'PAYMENT', module: 'invoices', recordId: id, after: { amount: v.amount, pph23: v.pph23, bankFee: v.bankFee } });
    return pay;
  });
}

export async function deletePayment(user, paymentId) {
  const pay = await prisma.invoicePayment.findUnique({ where: { id: paymentId }, include: { invoice: true } });
  ensure(pay, 'Pembayaran tidak ditemukan.', 404);
  return prisma.$transaction(async (tx) => {
    await tx.invoicePayment.delete({ where: { id: paymentId } });
    const paid = round2(Number(pay.invoice.paid) - Number(pay.amount) - Number(pay.pph23) - Number(pay.bankFee));
    await tx.invoice.update({ where: { id: pay.invoiceId }, data: { paid: Math.max(0, paid), status: paymentStatus(pay.invoice.total, Math.max(0, paid)) } });
    await audit(tx, user, { action: 'DELETE', module: 'invoices', recordId: pay.invoiceId, before: { amount: pay.amount, pph23: pay.pph23, date: iso(pay.date) }, note: 'Hapus pembayaran' });
    return { ok: true };
  });
}

/** Rekap nomor invoice (pengganti sheet "NO INVOICE"). */
export async function exportInvoices(user, f) {
  const { rows } = await listInvoices(f, { skip: 0, take: 10000 });
  const wb = XLSX.utils.book_new();
  for (const series of SERIES) {
    const data = rows.filter((r) => r.series === series).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || String(a.number).localeCompare(String(b.number))).map((r) => ({
      'No.': r.seq ?? '', 'No. invoice': r.number, Tanggal: iso(r.date), 'Jatuh tempo': iso(r.dueDate), Copart: r.client.name, Kontrak: r.project?.name ?? '',
      Tahap: r.milestone?.name ?? r.subject ?? '', Kategori: labelOf(r.category), Dokumen: labelOf(r.docType),
      DPP: Number(r.dpp), PPN: Number(r.ppn), Total: Number(r.total), Diterima: Number(r.paid), Sisa: round2(Number(r.total) - Number(r.paid)),
      Status: labelOf(r.status), Dikirim: r.sentAt ? `${iso(r.sentAt)} (${labelOf(r.sentVia)})` : '', 'Faktur pajak': r.taxInvoiceNo ?? '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.length ? data : [{ 'No.': '' }]), labelOf(series));
  }
  await audit(null, user, { action: 'EXPORT', module: 'invoices', note: `Export ${rows.length} invoice` });
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export const suggestDue = (d, days) => addDays(d, days ?? 14);
