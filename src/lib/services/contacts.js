import { prisma } from '../prisma.js';
import { audit, diff } from '../audit.js';
import { normalizeShortCode, round2, suggestShortCode } from '../domain/billing.js';
import { bool, ensure, int, npwp, object, text } from '../validation.js';
import { searchOr } from './common.js';

export async function listContacts(f = {}, { skip = 0, take = 50 } = {}) {
  const where = { type: 'CLIENT' };
  if (f.active === '1') where.isActive = true;
  const or = searchOr(f.q, ['name', 'code', 'shortCode', 'pic', 'city', 'npwp']);
  if (or) where.OR = or;
  const [rows, total] = await Promise.all([
    prisma.contact.findMany({ where, skip, take, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] }),
    prisma.contact.count({ where }),
  ]);
  const inv = await prisma.invoice.groupBy({ by: ['clientId'], where: { clientId: { in: rows.map((r) => r.id) }, status: { in: ['UNPAID', 'PARTIAL'] } }, _sum: { total: true, paid: true } });
  const ar = Object.fromEntries(inv.map((r) => [r.clientId, round2(Number(r._sum.total ?? 0) - Number(r._sum.paid ?? 0))]));
  return { rows: rows.map((r) => ({ ...r, receivable: ar[r.id] ?? 0 })), total };
}

/** Pilihan Copart ringkas untuk form. */
export function contactOptions() {
  return prisma.contact.findMany({
    where: { isActive: true, type: 'CLIENT' },
    select: { id: true, code: true, shortCode: true, name: true, paymentTermDays: true, npwp: true, address: true, city: true, pic: true },
    orderBy: { name: 'asc' },
  });
}

function parse(body) {
  object(body, ['name', 'shortCode', 'npwp', 'isPkp', 'pic', 'email', 'phone', 'address', 'city', 'industry', 'paymentTermDays', 'notes', 'isActive']);
  const name = text(body.name, 'Nama Copart', 150);
  const data = {
    name,
    shortCode: normalizeShortCode(body.shortCode) ?? suggestShortCode(name),
    npwp: npwp(body.npwp),
    isPkp: bool(body.isPkp),
    pic: text(body.pic, 'PIC', 120, true),
    email: text(body.email, 'Email', 254, true),
    phone: text(body.phone, 'Telepon', 40, true),
    address: text(body.address, 'Alamat', 500, true),
    city: text(body.city, 'Kota', 80, true),
    industry: text(body.industry, 'Bidang usaha', 120, true),
    paymentTermDays: int(body.paymentTermDays ?? 14, 'Termin pembayaran', 0, 365),
    notes: text(body.notes, 'Catatan', 1000, true),
    isActive: body.isActive === undefined ? true : bool(body.isActive),
  };
  ensure(!data.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email), 'Email tidak valid.');
  return data;
}

export async function saveContact(user, id, body) {
  const data = parse(body);
  return prisma.$transaction(async (tx) => {
    if (id) {
      const before = await tx.contact.findUnique({ where: { id } });
      ensure(before, 'Copart tidak ditemukan.', 404);
      const row = await tx.contact.update({ where: { id }, data });
      await audit(tx, user, { action: 'UPDATE', module: 'contacts', recordId: id, ...diff(before, data) });
      return row;
    }
    const seq = await tx.sequence.upsert({ where: { key: 'contact-CLIENT' }, create: { key: 'contact-CLIENT', value: 1 }, update: { value: { increment: 1 } } });
    const code = `CP-${String(seq.value).padStart(4, '0')}`;
    const row = await tx.contact.create({ data: { ...data, code, type: 'CLIENT' } });
    await audit(tx, user, { action: 'CREATE', module: 'contacts', recordId: row.id, after: { code, ...data } });
    return row;
  });
}

export async function deleteContact(user, id) {
  const c = await prisma.contact.findUnique({ where: { id }, include: { _count: { select: { invoices: true, projects: true } } } });
  ensure(c, 'Copart tidak ditemukan.', 404);
  ensure(!c._count.invoices && !c._count.projects, 'Copart sudah memiliki kontrak/invoice; nonaktifkan saja.', 409);
  return prisma.$transaction(async (tx) => {
    await tx.contact.delete({ where: { id } });
    await audit(tx, user, { action: 'DELETE', module: 'contacts', recordId: id, before: c });
    return { ok: true };
  });
}
