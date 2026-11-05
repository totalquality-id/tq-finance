import { prisma } from '../prisma.js';
import { actorName, audit } from '../audit.js';
import { ASSETS_KEY, SETTING_DEFAULTS, SETTING_KEYS, sequenceKey } from '../settings-defaults.js';
import { invoiceAssets } from '../settings.js';
import { ensure, InputError, int, number, object } from '../validation.js';

const SERIES_KEYS = { 'invoice.seriesTQ': 'TQ', 'invoice.seriesOPS': 'OPS' };

export async function listSettings() {
  const [rows, seqs] = await Promise.all([
    prisma.setting.findMany({ where: { key: { in: SETTING_KEYS } } }),
    prisma.sequence.findMany({ where: { key: { in: Object.values(SERIES_KEYS).map(sequenceKey) } } }),
  ]);
  const map = Object.fromEntries(rows.map((r) => [r.key, r]));
  const seq = Object.fromEntries(seqs.map((s) => [s.key, s.value]));
  return SETTING_KEYS.map((key) => {
    const value = { ...SETTING_DEFAULTS[key].value, ...(map[key]?.value ?? {}) };
    // Nomor berikutnya selalu dibaca dari urutan yang benar-benar dipakai.
    if (SERIES_KEYS[key] && seq[sequenceKey(SERIES_KEYS[key])] !== undefined) value.nextNumber = seq[sequenceKey(SERIES_KEYS[key])] + 1;
    return { key, label: SETTING_DEFAULTS[key].label, fields: SETTING_DEFAULTS[key].fields, value, updatedBy: map[key]?.updatedBy ?? null, updatedAt: map[key]?.updatedAt ?? null };
  });
}

function requireManager(user) {
  if (user.role !== 'MANAJER_KEUANGAN') throw new InputError('Pengaturan diatur Manajer Keuangan.', 403);
}

export async function saveSetting(user, key, body) {
  requireManager(user);
  ensure(SETTING_KEYS.includes(key), 'Parameter tidak dikenal.', 404);
  object(body, ['value']);
  const def = SETTING_DEFAULTS[key];
  ensure(body.value && typeof body.value === 'object' && !Array.isArray(body.value), 'Format nilai tidak valid.');
  const value = {};
  for (const [k, ref] of Object.entries(def.value)) {
    const raw = body.value[k];
    value[k] = typeof ref === 'number' ? number(raw, def.fields[k], 0, 1e13) : String(raw ?? '').trim().slice(0, 500);
  }
  const series = SERIES_KEYS[key];
  if (series) value.nextNumber = int(value.nextNumber, 'Nomor berikutnya', 1, 999999);
  return prisma.$transaction(async (tx) => {
    if (series) {
      const used = await tx.invoice.aggregate({ where: { series }, _max: { seq: true } });
      ensure(!used._max.seq || value.nextNumber > used._max.seq, `Nomor berikutnya harus lebih besar dari nomor terakhir (${used._max.seq}).`);
      await tx.sequence.upsert({ where: { key: sequenceKey(series) }, create: { key: sequenceKey(series), value: value.nextNumber - 1 }, update: { value: value.nextNumber - 1 } });
    }
    const before = await tx.setting.findUnique({ where: { key } });
    const row = await tx.setting.upsert({ where: { key }, create: { key, value, updatedBy: actorName(user) }, update: { value, updatedBy: actorName(user) } });
    await audit(tx, user, { action: 'UPDATE', module: 'settings', recordId: key, before: before?.value ?? null, after: value });
    return row;
  });
}

// ─── Stempel & tanda tangan ──────────────────────────────────────────────────
const IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export const getAssets = () => invoiceAssets();

export async function saveAssets(user, body) {
  requireManager(user);
  object(body, ['stamp', 'signature']);
  const current = await invoiceAssets();
  const next = { ...current };
  for (const k of ['stamp', 'signature']) {
    if (body[k] === undefined) continue;
    const v = String(body[k] ?? '');
    ensure(v === '' || (IMAGE.test(v) && v.length <= 700_000), 'Gambar harus PNG/JPG/WEBP maksimal ±500 KB.');
    next[k] = v;
  }
  return prisma.$transaction(async (tx) => {
    await tx.setting.upsert({ where: { key: ASSETS_KEY }, create: { key: ASSETS_KEY, value: next, updatedBy: actorName(user) }, update: { value: next, updatedBy: actorName(user) } });
    await audit(tx, user, { action: 'UPDATE', module: 'settings', recordId: ASSETS_KEY, note: 'Ubah stempel / tanda tangan' });
    return { stamp: Boolean(next.stamp), signature: Boolean(next.signature) };
  });
}

// ─── Audit log ───────────────────────────────────────────────────────────────
export async function listAudit(f, { skip = 0, take = 50 } = {}) {
  const where = {};
  if (f.module) where.module = String(f.module);
  if (f.action) where.action = String(f.action);
  if (f.recordId) where.recordId = String(f.recordId);
  if (f.q) where.OR = [{ actorName: { contains: String(f.q).slice(0, 80), mode: 'insensitive' } }, { note: { contains: String(f.q).slice(0, 80), mode: 'insensitive' } }];
  if (f.from || f.to) where.createdAt = { ...(f.from ? { gte: new Date(f.from + 'T00:00:00Z') } : {}), ...(f.to ? { lt: new Date(new Date(f.to + 'T00:00:00Z').getTime() + 86400000) } : {}) };
  const [rows, total] = await Promise.all([prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }), prisma.auditLog.count({ where })]);
  return { rows, total };
}
