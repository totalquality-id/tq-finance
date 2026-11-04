import { prisma } from '../prisma.js';
import { actorName, audit } from '../audit.js';
import { round2, signed } from '../domain/accounting.js';
import { array, choice, date, ensure, id as idOf, number, object, optionalId, text } from '../validation.js';
import { searchOr } from './common.js';
import { docNumber, postJournal, removeJournal, replaceJournal } from './ledger.js';

/** Akun kas & bank beserta saldo (s.d. hari ini atau tanggal tertentu). */
export async function cashAccounts({ to } = {}) {
  const accounts = await prisma.account.findMany({ where: { isCash: true, isGroup: false }, orderBy: { code: 'asc' } });
  const sums = await prisma.journalLine.groupBy({ by: ['accountId'], where: { accountId: { in: accounts.map((a) => a.id) }, ...(to ? { date: { lte: to } } : {}) }, _sum: { debit: true, credit: true } });
  const bal = Object.fromEntries(sums.map((s) => [s.accountId, signed('DEBIT', s._sum.debit ?? 0, s._sum.credit ?? 0)]));
  return accounts.map((a) => ({ id: a.id, code: a.code, name: a.name, isActive: a.isActive, balance: round2(bal[a.id] ?? 0) }));
}

export async function listCash(f = {}, { skip = 0, take = 50 } = {}) {
  const where = {};
  if (['IN', 'OUT', 'TRANSFER'].includes(f.type)) where.type = f.type;
  if (f.accountId) where.OR = [{ cashAccountId: String(f.accountId) }, { toAccountId: String(f.accountId) }];
  if (f.from || f.to) where.date = { ...(f.from ? { gte: date(f.from) } : {}), ...(f.to ? { lte: date(f.to) } : {}) };
  const or = searchOr(f.q, ['number', 'description', 'counterparty']);
  if (or) where.AND = [{ OR: or }];
  const [rows, total] = await Promise.all([
    prisma.cashTransaction.findMany({ where, skip, take, orderBy: [{ date: 'desc' }, { number: 'desc' }] }),
    prisma.cashTransaction.count({ where }),
  ]);
  return { rows, total };
}

async function parse(body) {
  object(body, ['type', 'date', 'cashAccountId', 'toAccountId', 'projectId', 'counterparty', 'description', 'lines', 'amount']);
  const v = {
    type: choice(body.type, ['IN', 'OUT', 'TRANSFER'], 'Jenis transaksi'),
    date: date(body.date, 'Tanggal'),
    cashAccountId: idOf(body.cashAccountId, 'Akun kas/bank'),
    toAccountId: optionalId(body.toAccountId, 'Akun tujuan'),
    projectId: optionalId(body.projectId, 'Proyek'),
    counterparty: text(body.counterparty, 'Diterima dari / dibayar ke', 150, true),
    description: text(body.description, 'Keterangan', 300),
  };
  const ids = [v.cashAccountId, v.toAccountId].filter(Boolean);
  const cashRows = await prisma.account.findMany({ where: { id: { in: ids }, isCash: true } });
  ensure(cashRows.length === ids.length, 'Akun kas/bank tidak valid.');
  let lines = [];
  if (v.type === 'TRANSFER') {
    ensure(v.toAccountId && v.toAccountId !== v.cashAccountId, 'Pilih rekening tujuan yang berbeda.');
    v.amount = number(body.amount, 'Nominal transfer', 0.01);
    v.projectId = null;
  } else {
    v.toAccountId = null;
    lines = array(body.lines, 'Rincian', 50).map((l, i) => ({
      accountId: idOf(l.accountId, `Akun baris ${i + 1}`),
      description: text(l.description, `Uraian baris ${i + 1}`, 300, true),
      amount: number(l.amount, `Nominal baris ${i + 1}`, 0.01),
    }));
    ensure(!lines.some((l) => l.accountId === v.cashAccountId), 'Akun lawan tidak boleh sama dengan akun kas/bank.');
    v.amount = round2(lines.reduce((s, l) => s + l.amount, 0));
  }
  return { v, lines };
}

function journalLines({ v, lines }) {
  if (v.type === 'TRANSFER') {
    return [
      { accountId: v.toAccountId, debit: v.amount, credit: 0, description: v.description },
      { accountId: v.cashAccountId, debit: 0, credit: v.amount, description: v.description },
    ];
  }
  const cash = { accountId: v.cashAccountId, description: v.description + (v.counterparty ? ' — ' + v.counterparty : '') };
  const counter = lines.map((l) => ({ accountId: l.accountId, projectId: v.projectId, description: l.description ?? v.description, debit: v.type === 'OUT' ? l.amount : 0, credit: v.type === 'IN' ? l.amount : 0 }));
  return v.type === 'IN' ? [{ ...cash, debit: v.amount, credit: 0 }, ...counter] : [...counter, { ...cash, debit: 0, credit: v.amount }];
}

const SEQ = { IN: 'CASH_IN', OUT: 'CASH_OUT', TRANSFER: 'TRANSFER' };

export async function saveCash(user, id, body) {
  const p = await parse(body);
  return prisma.$transaction(async (tx) => {
    if (id) {
      const before = await tx.cashTransaction.findUnique({ where: { id } });
      ensure(before, 'Transaksi tidak ditemukan.', 404);
      ensure(before.type === p.v.type, 'Jenis transaksi tidak dapat diubah; hapus lalu buat baru.');
      await replaceJournal(tx, before.journalId, { date: p.v.date, description: p.v.description, reference: before.number, lines: journalLines(p) });
      const row = await tx.cashTransaction.update({ where: { id }, data: { ...p.v, lines: p.lines } });
      await audit(tx, user, { action: 'UPDATE', module: 'cash', recordId: id, before: { amount: before.amount, date: before.date }, after: { amount: p.v.amount, date: p.v.date } });
      return row;
    }
    const number = await docNumber(tx, SEQ[p.v.type], p.v.date);
    const j = await postJournal(tx, user, { date: p.v.date, description: p.v.description, reference: number, source: 'CASH', lines: journalLines(p) });
    const row = await tx.cashTransaction.create({ data: { ...p.v, number, lines: p.lines, journalId: j.id, createdBy: user.id, creatorName: actorName(user) } });
    await tx.journal.update({ where: { id: j.id }, data: { sourceId: row.id } });
    await audit(tx, user, { action: 'CREATE', module: 'cash', recordId: row.id, after: { number, type: p.v.type, amount: p.v.amount } });
    return row;
  });
}

export async function deleteCash(user, id) {
  const row = await prisma.cashTransaction.findUnique({ where: { id } });
  ensure(row, 'Transaksi tidak ditemukan.', 404);
  return prisma.$transaction(async (tx) => {
    await removeJournal(tx, row.journalId);
    await tx.cashTransaction.delete({ where: { id } });
    await audit(tx, user, { action: 'DELETE', module: 'cash', recordId: id, before: { number: row.number, amount: row.amount, description: row.description } });
    return { ok: true };
  });
}
