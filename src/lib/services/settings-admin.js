import { prisma } from '../prisma.js';
import { actorName, audit } from '../audit.js';
import { LOCK_KEY, SETTING_DEFAULTS, SETTING_KEYS } from '../settings-defaults.js';
import { lockDate } from '../settings.js';
import { iso } from '../dates.js';
import { bool, choice, date, ensure, InputError, number, object, optionalId, text } from '../validation.js';

export async function listSettings() {
  const rows = await prisma.setting.findMany({ where: { key: { in: SETTING_KEYS } } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r]));
  return SETTING_KEYS.map((key) => ({
    key,
    label: SETTING_DEFAULTS[key].label,
    hint: SETTING_DEFAULTS[key].hint ?? null,
    fields: SETTING_DEFAULTS[key].fields,
    accountFields: Boolean(SETTING_DEFAULTS[key].accountFields),
    value: { ...SETTING_DEFAULTS[key].value, ...(map[key]?.value ?? {}) },
    updatedBy: map[key]?.updatedBy ?? null,
    updatedAt: map[key]?.updatedAt ?? null,
  }));
}

function requireManager(user) {
  if (user.role !== 'MANAJER_KEUANGAN') throw new InputError('Pengaturan diatur Manajer Keuangan.', 403);
}

export async function saveSetting(user, key, body) {
  requireManager(user);
  ensure(SETTING_KEYS.includes(key), 'Parameter tidak dikenal.', 404);
  object(body, ['value']);
  const ref = SETTING_DEFAULTS[key].value;
  ensure(body.value && typeof body.value === 'object' && !Array.isArray(body.value), 'Format nilai tidak valid.');
  const value = {};
  for (const [k, def] of Object.entries(ref)) {
    const raw = body.value[k];
    value[k] = typeof def === 'number' ? number(raw, SETTING_DEFAULTS[key].fields[k], 0, 3650) : String(raw ?? '').trim().slice(0, 500);
  }
  if (SETTING_DEFAULTS[key].accountFields) {
    const codes = Object.values(value).filter(Boolean);
    const found = await prisma.account.findMany({ where: { code: { in: codes }, isGroup: false }, select: { code: true } });
    const ok = new Set(found.map((a) => a.code));
    for (const [k, code] of Object.entries(value)) ensure(ok.has(code), `Akun untuk "${SETTING_DEFAULTS[key].fields[k]}" tidak valid.`);
  }
  return prisma.$transaction(async (tx) => {
    const before = await tx.setting.findUnique({ where: { key } });
    const row = await tx.setting.upsert({ where: { key }, create: { key, value, updatedBy: actorName(user) }, update: { value, updatedBy: actorName(user) } });
    await audit(tx, user, { action: 'UPDATE', module: 'settings', recordId: key, before: before?.value ?? null, after: value });
    return row;
  });
}

// ─── Tutup buku ──────────────────────────────────────────────────────────────
export async function setLockDate(user, body) {
  requireManager(user);
  object(body, ['lockDate']);
  const value = body.lockDate ? iso(date(body.lockDate, 'Tanggal tutup buku')) : '';
  return prisma.$transaction(async (tx) => {
    const before = await lockDate(tx);
    await tx.setting.upsert({ where: { key: LOCK_KEY }, create: { key: LOCK_KEY, value, updatedBy: actorName(user) }, update: { value, updatedBy: actorName(user) } });
    await audit(tx, user, { action: 'CLOSE', module: 'settings', recordId: LOCK_KEY, before: { lockDate: before }, after: { lockDate: value || null }, note: value ? `Tutup buku s.d. ${value}` : 'Buka seluruh periode' });
    return { lockDate: value || null };
  });
}

// ─── Pajak dinamis ───────────────────────────────────────────────────────────
export const listTaxes = () => prisma.tax.findMany({ orderBy: [{ isActive: 'desc' }, { code: 'asc' }] });

export async function saveTax(user, id, body) {
  requireManager(user);
  object(body, ['code', 'name', 'rate', 'type', 'appliesTo', 'salesAccountId', 'purchaseAccountId', 'isActive']);
  const data = {
    code: text(body.code, 'Kode', 20).toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
    name: text(body.name, 'Nama pajak', 80),
    rate: number(body.rate, 'Tarif', 0, 100),
    type: choice(body.type, ['ADDITION', 'DEDUCTION'], 'Jenis'),
    appliesTo: choice(body.appliesTo ?? 'BOTH', ['SALES', 'PURCHASE', 'BOTH'], 'Berlaku untuk'),
    salesAccountId: optionalId(body.salesAccountId, 'Akun penjualan'),
    purchaseAccountId: optionalId(body.purchaseAccountId, 'Akun pembelian'),
    isActive: body.isActive === undefined ? true : bool(body.isActive),
  };
  if (data.appliesTo !== 'PURCHASE') ensure(data.salesAccountId, 'Akun penjualan wajib untuk pajak yang berlaku di invoice.');
  if (data.appliesTo !== 'SALES') ensure(data.purchaseAccountId, 'Akun pembelian wajib untuk pajak yang berlaku di tagihan vendor.');
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.tax.findUnique({ where: { id } }) : null;
    if (id) ensure(before, 'Pajak tidak ditemukan.', 404);
    const row = id ? await tx.tax.update({ where: { id }, data }) : await tx.tax.create({ data });
    await audit(tx, user, { action: id ? 'UPDATE' : 'CREATE', module: 'settings', recordId: row.id, before, after: data, note: 'Pajak ' + data.code });
    return row;
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
