import { prisma } from '../prisma.js';
import { audit, diff } from '../audit.js';
import { monthRange } from '../dates.js';
import { depreciationFor, round2 } from '../domain/accounting.js';
import { choice, date, ensure, id as idOf, int, month, number, object, text } from '../validation.js';
import { postJournal, removeJournal } from './ledger.js';

export const ASSET_CATEGORIES = ['KOMPUTER', 'PERALATAN', 'FURNITUR', 'KENDARAAN', 'BANGUNAN', 'LAINNYA'];
// Masa manfaat acuan kelompok harta PMK (bulan): kelompok 1 = 4 th, kelompok 2 = 8 th, bangunan = 20 th.
export const DEFAULT_LIFE = { KOMPUTER: 48, PERALATAN: 48, FURNITUR: 48, KENDARAAN: 96, BANGUNAN: 240, LAINNYA: 48 };

export async function listAssets(f = {}) {
  const where = {};
  if (f.status) where.status = String(f.status);
  if (ASSET_CATEGORIES.includes(f.category)) where.category = f.category;
  const rows = await prisma.fixedAsset.findMany({ where, orderBy: [{ status: 'asc' }, { acquisitionDate: 'desc' }], include: { depreciations: { orderBy: { period: 'desc' } } } });
  return rows.map((a) => {
    const accumulated = round2(a.depreciations.reduce((s, d) => s + Number(d.amount), 0));
    return { ...a, accumulated, bookValue: round2(Number(a.cost) - accumulated), lastPeriod: a.depreciations[0]?.period ?? null, monthly: Math.round((Number(a.cost) - Number(a.residualValue)) / a.usefulLifeMonths) };
  });
}

function parse(body) {
  object(body, ['name', 'category', 'acquisitionDate', 'cost', 'residualValue', 'usefulLifeMonths', 'assetAccountId', 'accumAccountId', 'expenseAccountId', 'location', 'status', 'notes']);
  const data = {
    name: text(body.name, 'Nama aset', 150),
    category: choice(body.category, ASSET_CATEGORIES, 'Kategori'),
    acquisitionDate: date(body.acquisitionDate, 'Tanggal perolehan'),
    cost: number(body.cost, 'Harga perolehan', 1),
    residualValue: number(body.residualValue ?? 0, 'Nilai sisa', 0),
    usefulLifeMonths: int(body.usefulLifeMonths, 'Masa manfaat (bulan)', 1, 600),
    assetAccountId: idOf(body.assetAccountId, 'Akun aset'),
    accumAccountId: idOf(body.accumAccountId, 'Akun akumulasi penyusutan'),
    expenseAccountId: idOf(body.expenseAccountId, 'Akun beban penyusutan'),
    location: text(body.location, 'Lokasi / pemakai', 120, true),
    status: choice(body.status ?? 'AKTIF', ['AKTIF', 'DILEPAS'], 'Status'),
    notes: text(body.notes, 'Catatan', 1000, true),
  };
  ensure(data.residualValue < data.cost, 'Nilai sisa harus lebih kecil dari harga perolehan.');
  return data;
}

export async function saveAsset(user, id, body) {
  const data = parse(body);
  return prisma.$transaction(async (tx) => {
    if (id) {
      const before = await tx.fixedAsset.findUnique({ where: { id }, include: { _count: { select: { depreciations: true } } } });
      ensure(before, 'Aset tidak ditemukan.', 404);
      if (before._count.depreciations) {
        ensure(Number(before.cost) === data.cost && before.usefulLifeMonths === data.usefulLifeMonths && Number(before.residualValue) === data.residualValue,
          'Aset sudah disusutkan; harga, nilai sisa, dan masa manfaat tidak dapat diubah.');
      }
      const row = await tx.fixedAsset.update({ where: { id }, data: { ...data, disposedAt: data.status === 'DILEPAS' ? before.disposedAt ?? new Date() : null } });
      await audit(tx, user, { action: 'UPDATE', module: 'assets', recordId: id, ...diff(before, data) });
      return row;
    }
    const year = data.acquisitionDate.getUTCFullYear();
    const seq = await tx.sequence.upsert({ where: { key: 'asset-' + year }, create: { key: 'asset-' + year, value: 1 }, update: { value: { increment: 1 } } });
    const code = `AST-${year}-${String(seq.value).padStart(3, '0')}`;
    const row = await tx.fixedAsset.create({ data: { ...data, code } });
    await audit(tx, user, { action: 'CREATE', module: 'assets', recordId: row.id, after: { code, ...data } });
    return row;
  });
}

/** Hitung (tanpa menyimpan) penyusutan satu periode untuk seluruh aset aktif. */
export async function previewDepreciation(period) {
  month(period);
  const assets = await prisma.fixedAsset.findMany({ where: { status: 'AKTIF' }, include: { depreciations: true } });
  return assets.map((a) => {
    const done = a.depreciations.find((d) => d.period === period);
    const accumulated = a.depreciations.filter((d) => d.period < period).reduce((s, d) => s + Number(d.amount), 0);
    return { id: a.id, code: a.code, name: a.name, amount: done ? Number(done.amount) : depreciationFor(a, period, accumulated), posted: Boolean(done) };
  }).filter((r) => r.amount > 0);
}

export async function runDepreciation(user, body) {
  object(body, ['period']);
  const period = month(body.period);
  const items = (await previewDepreciation(period)).filter((r) => !r.posted);
  ensure(items.length, 'Tidak ada penyusutan yang perlu diposting untuk periode ini.');
  const assets = Object.fromEntries((await prisma.fixedAsset.findMany({ where: { id: { in: items.map((i) => i.id) } } })).map((a) => [a.id, a]));
  const { end } = monthRange(period);
  return prisma.$transaction(async (tx) => {
    const lines = items.flatMap((i) => {
      const a = assets[i.id];
      return [
        { accountId: a.expenseAccountId, debit: i.amount, credit: 0, description: `Penyusutan ${a.code} ${a.name}` },
        { accountId: a.accumAccountId, debit: 0, credit: i.amount, description: `Akum. penyusutan ${a.code}` },
      ];
    });
    const j = await postJournal(tx, user, { date: end, description: `Penyusutan aset tetap periode ${period}`, reference: period, source: 'DEPRECIATION', sourceId: period, lines });
    await tx.assetDepreciation.createMany({ data: items.map((i) => ({ assetId: i.id, period, amount: i.amount, journalId: j.id })) });
    await audit(tx, user, { action: 'POST', module: 'assets', recordId: j.id, after: { period, assets: items.length, total: round2(items.reduce((s, i) => s + i.amount, 0)) } });
    return { journal: j.number, count: items.length };
  });
}

export async function undoDepreciation(user, body) {
  object(body, ['period']);
  const period = month(body.period);
  const rows = await prisma.assetDepreciation.findMany({ where: { period } });
  ensure(rows.length, 'Belum ada penyusutan untuk periode ini.');
  const later = await prisma.assetDepreciation.count({ where: { period: { gt: period } } });
  ensure(!later, 'Batalkan dulu penyusutan periode setelahnya.');
  return prisma.$transaction(async (tx) => {
    for (const jid of [...new Set(rows.map((r) => r.journalId))]) await removeJournal(tx, jid);
    await tx.assetDepreciation.deleteMany({ where: { period } });
    await audit(tx, user, { action: 'DELETE', module: 'assets', recordId: period, note: `Batalkan penyusutan ${period}` });
    return { ok: true };
  });
}

