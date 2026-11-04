import { prisma } from '../prisma.js';
import { audit } from '../audit.js';
import { array, choice, date, ensure, id as idOf, number, object, optionalId, text } from '../validation.js';
import { postJournal, removeJournal, replaceJournal } from './ledger.js';

export const JOURNAL_SOURCES = ['MANUAL', 'OPENING', 'INVOICE', 'INVOICE_PAYMENT', 'BILL', 'BILL_PAYMENT', 'CASH', 'TAX_PAYMENT', 'DEPRECIATION'];
const EDITABLE = ['MANUAL', 'OPENING'];

export async function listJournals(f = {}, { skip = 0, take = 50 } = {}) {
  const where = {};
  if (JOURNAL_SOURCES.includes(f.source)) where.source = f.source;
  if (f.from || f.to) where.date = { ...(f.from ? { gte: date(f.from) } : {}), ...(f.to ? { lte: date(f.to) } : {}) };
  if (f.accountId) where.lines = { some: { accountId: String(f.accountId) } };
  if (f.q) {
    const q = String(f.q).slice(0, 80);
    where.OR = [{ number: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { reference: { contains: q, mode: 'insensitive' } }];
  }
  const [rows, total] = await Promise.all([
    prisma.journal.findMany({
      where, skip, take, orderBy: [{ date: 'desc' }, { number: 'desc' }],
      include: { lines: { orderBy: { sort: 'asc' }, include: { account: { select: { code: true, name: true } }, project: { select: { code: true } } } } },
    }),
    prisma.journal.count({ where }),
  ]);
  return { rows: rows.map((r) => ({ ...r, editable: EDITABLE.includes(r.source) })), total };
}

function parse(body) {
  object(body, ['date', 'description', 'reference', 'source', 'lines']);
  return {
    date: date(body.date, 'Tanggal jurnal'),
    description: text(body.description, 'Keterangan', 300),
    reference: text(body.reference, 'Referensi', 80, true),
    source: choice(body.source ?? 'MANUAL', EDITABLE, 'Jenis jurnal'),
    lines: array(body.lines, 'Baris jurnal', 200).map((l, i) => ({
      accountId: idOf(l.accountId, `Akun baris ${i + 1}`),
      projectId: optionalId(l.projectId, `Proyek baris ${i + 1}`),
      description: text(l.description, `Uraian baris ${i + 1}`, 300, true),
      debit: number(l.debit || 0, `Debit baris ${i + 1}`, 0),
      credit: number(l.credit || 0, `Kredit baris ${i + 1}`, 0),
    })),
  };
}

export async function createJournal(user, body) {
  const v = parse(body);
  return prisma.$transaction(async (tx) => {
    const j = await postJournal(tx, user, v);
    await audit(tx, user, { action: 'CREATE', module: 'journals', recordId: j.id, after: { number: j.number, description: v.description, total: j.totalDebit } });
    return j;
  });
}

export async function updateJournal(user, id, body) {
  const v = parse(body);
  const before = await prisma.journal.findUnique({ where: { id }, include: { lines: true } });
  ensure(before, 'Jurnal tidak ditemukan.', 404);
  ensure(EDITABLE.includes(before.source), 'Jurnal otomatis diubah melalui dokumen sumbernya (invoice, tagihan, kas).', 409);
  return prisma.$transaction(async (tx) => {
    const j = await replaceJournal(tx, id, v);
    await tx.journal.update({ where: { id }, data: { source: v.source } });
    await audit(tx, user, { action: 'UPDATE', module: 'journals', recordId: id, before: { date: before.date, total: before.totalDebit, lines: before.lines.length }, after: { date: v.date, total: j.totalDebit, lines: v.lines.length } });
    return j;
  });
}

export async function deleteJournal(user, id) {
  const before = await prisma.journal.findUnique({ where: { id } });
  ensure(before, 'Jurnal tidak ditemukan.', 404);
  ensure(EDITABLE.includes(before.source), 'Jurnal otomatis dihapus melalui dokumen sumbernya.', 409);
  return prisma.$transaction(async (tx) => {
    await removeJournal(tx, id);
    await audit(tx, user, { action: 'DELETE', module: 'journals', recordId: id, before: { number: before.number, description: before.description, total: before.totalDebit } });
    return { ok: true };
  });
}
