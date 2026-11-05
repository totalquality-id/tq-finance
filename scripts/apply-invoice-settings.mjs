// Menerapkan pengaturan invoice internal (rekening, penanda tangan, nomor awal,
// target, stempel & tanda tangan) dari file JSON privat ke database.
//   node --env-file=<env> scripts/apply-invoice-settings.mjs <path/ke/settings.json>
// File JSON berisi data internal TQ — simpan di luar repo, jangan di-commit.
import { readFileSync } from 'node:fs';
import { prisma } from '../src/lib/prisma.js';
import { ASSETS_KEY, SETTING_DEFAULTS, sequenceKey } from '../src/lib/settings-defaults.js';

const file = process.argv[2];
if (!file) throw new Error('Pemakaian: apply-invoice-settings.mjs <settings.json>');
const data = JSON.parse(readFileSync(file, 'utf8'));
const by = 'Import pengaturan';

for (const [key, value] of Object.entries(data)) {
  if (key === 'assets') {
    await prisma.setting.upsert({ where: { key: ASSETS_KEY }, create: { key: ASSETS_KEY, value, updatedBy: by }, update: { value, updatedBy: by } });
    continue;
  }
  if (!SETTING_DEFAULTS[key]) throw new Error('Kunci tidak dikenal: ' + key);
  await prisma.setting.upsert({ where: { key }, create: { key, value, updatedBy: by }, update: { value, updatedBy: by } });
  const series = { 'invoice.seriesTQ': 'TQ', 'invoice.seriesOPS': 'OPS' }[key];
  if (series && value.nextNumber) {
    const used = await prisma.invoice.aggregate({ where: { series }, _max: { seq: true } });
    const last = Math.max(value.nextNumber - 1, used._max.seq ?? 0);
    await prisma.sequence.upsert({ where: { key: sequenceKey(series) }, create: { key: sequenceKey(series), value: last }, update: { value: last } });
  }
}
console.log('Pengaturan diterapkan:', Object.keys(data).join(', '));
await prisma.$disconnect();
