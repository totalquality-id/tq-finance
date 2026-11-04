import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { prisma } from '../prisma.js';
import { ROLES } from '../access.js';
import { audit, diff } from '../audit.js';
import { bool, choice, ensure, object, text } from '../validation.js';

const FIELDS = ['name', 'email', 'password', 'role', 'isActive'];
const SELECT = { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true };

export const listUsers = () => prisma.user.findMany({ select: SELECT, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });

function password(value, optional) {
  if (optional && !value) return null;
  ensure(typeof value === 'string' && value.length >= 10 && Buffer.byteLength(value) <= 72, 'Kata sandi minimal 10 karakter.');
  return value;
}

async function parse(body, editing) {
  object(body, FIELDS);
  const data = {
    name: text(body.name, 'Nama', 120),
    email: text(body.email, 'Email', 254).toLowerCase(),
    role: choice(body.role, ROLES, 'Peran'),
    isActive: body.isActive === undefined ? true : bool(body.isActive),
  };
  ensure(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email), 'Email tidak valid.');
  const pw = password(body.password, editing);
  if (pw) data.password = await bcrypt.hash(pw, 12);
  return data;
}

export async function createUser(body, actor) {
  const data = await parse(body, false);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data, select: SELECT });
    await audit(tx, actor, { action: 'CREATE', module: 'users', recordId: user.id, after: { ...data, password: undefined } });
    return user;
  });
}

export async function updateUser(id, body, actor) {
  const data = await parse(body, true);
  ensure(!(id === actor.id && (!data.isActive || data.role !== actor.role)), 'Anda tidak dapat menonaktifkan atau mengubah peran akun sendiri.');
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id }, select: SELECT });
    ensure(before, 'Pengguna tidak ditemukan.', 404);
    // Perubahan akses memaksa sesi lama keluar.
    const accessChanged = data.password || data.role !== before.role || data.isActive !== before.isActive;
    const user = await tx.user.update({ where: { id }, data: { ...data, ...(accessChanged ? { sessionVersion: { increment: 1 } } : {}) }, select: SELECT });
    const d = diff(before, { ...data, password: data.password ? '[diubah]' : undefined });
    await audit(tx, actor, { action: 'UPDATE', module: 'users', recordId: id, before: d.before, after: d.after });
    return user;
  });
}

// Reset akses: kata sandi sementara ditampilkan sekali kepada Manajer Keuangan.
export async function resetPassword(id, actor) {
  const temp = randomBytes(9).toString('base64url');
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { password: await bcrypt.hash(temp, 12), sessionVersion: { increment: 1 } } });
    await audit(tx, actor, { action: 'UPDATE', module: 'users', recordId: id, note: 'Reset kata sandi' });
  });
  return { temporaryPassword: temp };
}

export async function changeOwnPassword(user, body) {
  object(body, ['current', 'next']);
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { password: true } });
  ensure(row && (await bcrypt.compare(String(body.current ?? ''), row.password)), 'Kata sandi lama salah.');
  const next = password(body.next, false);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(next, 12), sessionVersion: { increment: 1 } } });
    await audit(tx, user, { action: 'UPDATE', module: 'account', recordId: user.id, note: 'Ganti kata sandi sendiri' });
  });
  return { ok: true };
}
