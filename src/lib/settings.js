import { prisma } from './prisma.js';
import { ASSETS_KEY, SETTING_DEFAULTS } from './settings-defaults.js';

export async function getSettings(keys, db = prisma) {
  const rows = await db.setting.findMany({ where: { key: { in: keys } } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(keys.map((k) => [k, { ...(SETTING_DEFAULTS[k]?.value ?? {}), ...(map[k] ?? {}) }]));
}

/** Stempel & tanda tangan (data URL). Jangan dikirim ke klien kecuali halaman cetak/pengaturan. */
export async function invoiceAssets(db = prisma) {
  const row = await db.setting.findUnique({ where: { key: ASSETS_KEY } });
  return { stamp: row?.value?.stamp ?? '', signature: row?.value?.signature ?? '' };
}
