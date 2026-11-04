// Mesin buku besar: semua modul transaksi memposting lewat sini agar aturan
// keseimbangan, akun detail, nomor jurnal, dan tutup buku berlaku seragam.
import { prisma } from '../prisma.js';
import { actorName } from '../audit.js';
import { iso } from '../dates.js';
import { lockDate } from '../settings.js';
import { getSettings } from '../settings.js';
import { balanceLines, mergeLines } from '../domain/accounting.js';
import { ensure, InputError } from '../validation.js';

const PREFIX = {
  JOURNAL: 'JU', INVOICE: 'INV', RECEIPT: 'RCV', BILL: 'BILL', PAYMENT: 'PAY',
  CASH_IN: 'KM', CASH_OUT: 'KK', TRANSFER: 'TRF', TAX: 'SPP', PROJECT: 'PRJ', ASSET: 'AST',
};

/** Nomor dokumen berurutan per jenis per bulan: INV-202611-0001. */
export async function docNumber(tx, type, date = new Date()) {
  const ym = iso(date).slice(0, 7).replace('-', '');
  const key = `${type}-${ym}`;
  const row = await tx.sequence.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return `${PREFIX[type] ?? type}-${ym}-${String(row.value).padStart(4, '0')}`;
}

/** Tolak perubahan pada periode yang sudah ditutup. */
export async function assertOpen(db, ...dates) {
  const lock = await lockDate(db);
  if (!lock) return;
  for (const d of dates.filter(Boolean)) {
    if (iso(d) <= lock) throw new InputError(`Periode s.d. ${lock} sudah ditutup. Buka tutup buku terlebih dahulu (Manajer Keuangan).`, 409);
  }
}

export async function accountMapping(db = prisma) {
  const { 'accounts.mapping': map } = await getSettings(['accounts.mapping'], db);
  const codes = Object.values(map);
  const rows = await db.account.findMany({ where: { code: { in: codes } }, select: { id: true, code: true, name: true } });
  const byCode = Object.fromEntries(rows.map((r) => [r.code, r]));
  return Object.fromEntries(Object.entries(map).map(([k, code]) => [k, byCode[code] ?? null]));
}

export async function requireMapped(db, key, label) {
  const map = await accountMapping(db);
  ensure(map[key], `Akun ${label} belum dipetakan di Pengaturan.`);
  return map[key];
}

async function checkAccounts(db, lines) {
  const ids = [...new Set(lines.map((l) => l.accountId))];
  const rows = await db.account.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true, isGroup: true, isActive: true } });
  const map = Object.fromEntries(rows.map((r) => [r.id, r]));
  for (const id of ids) {
    const a = map[id];
    ensure(a, 'Akun jurnal tidak ditemukan.');
    ensure(!a.isGroup, `Akun ${a.code} adalah akun grup; pilih akun detail.`);
    ensure(a.isActive, `Akun ${a.code} ${a.name} nonaktif.`);
  }
  const pids = [...new Set(lines.map((l) => l.projectId).filter(Boolean))];
  if (pids.length) ensure((await db.project.count({ where: { id: { in: pids } } })) === pids.length, 'Proyek tidak ditemukan.');
}

function validated(lines) {
  try {
    return balanceLines(mergeLines(lines));
  } catch (e) {
    throw new InputError(e.message);
  }
}

/**
 * Buat jurnal. lines: [{accountId, projectId?, description?, debit, credit}].
 * Dipanggil di dalam transaksi Prisma (tx).
 */
export async function postJournal(tx, user, { date, description, reference = null, source = 'MANUAL', sourceId = null, lines }) {
  await assertOpen(tx, date);
  const v = validated(lines);
  await checkAccounts(tx, v.lines);
  const number = await docNumber(tx, 'JOURNAL', date);
  return tx.journal.create({
    data: {
      number, date, description, reference, source, sourceId,
      totalDebit: v.totalDebit, totalCredit: v.totalCredit,
      createdBy: user.id, creatorName: actorName(user),
      lines: { create: v.lines.map((l, i) => ({ accountId: l.accountId, projectId: l.projectId ?? null, description: l.description ?? null, debit: l.debit, credit: l.credit, date, sort: i })) },
    },
  });
}

/** Ganti isi jurnal yang sudah ada (edit dokumen sumber). Tanggal lama & baru harus di periode terbuka. */
export async function replaceJournal(tx, journalId, { date, description, reference = null, lines }) {
  const old = await tx.journal.findUnique({ where: { id: journalId } });
  ensure(old, 'Jurnal tidak ditemukan.', 404);
  await assertOpen(tx, old.date, date);
  const v = validated(lines);
  await checkAccounts(tx, v.lines);
  await tx.journalLine.deleteMany({ where: { journalId } });
  return tx.journal.update({
    where: { id: journalId },
    data: {
      date, description, reference, totalDebit: v.totalDebit, totalCredit: v.totalCredit,
      lines: { create: v.lines.map((l, i) => ({ accountId: l.accountId, projectId: l.projectId ?? null, description: l.description ?? null, debit: l.debit, credit: l.credit, date, sort: i })) },
    },
  });
}

export async function removeJournal(tx, journalId) {
  if (!journalId) return;
  const old = await tx.journal.findUnique({ where: { id: journalId } });
  if (!old) return;
  await assertOpen(tx, old.date);
  await tx.journal.delete({ where: { id: journalId } });
}

/** Akun detail aktif untuk pilihan di form (ringkas). */
export function accountOptions(where = {}) {
  return prisma.account.findMany({
    where: { isGroup: false, isActive: true, ...where },
    select: { id: true, code: true, name: true, type: true, isCash: true, normalBalance: true },
    orderBy: { code: 'asc' },
  });
}
