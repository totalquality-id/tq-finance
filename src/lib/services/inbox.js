import { prisma } from '../prisma.js';
import { ensure, object } from '../validation.js';

export async function listNotifications(user, f = {}, { skip = 0, take = 50 } = {}) {
  const where = { userId: user.id, ...(f.unread === '1' ? { readAt: null } : {}), ...(f.type ? { type: String(f.type) } : {}) };
  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, skip, take, orderBy: [{ readAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }] }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return { rows, total, unread };
}

export const unreadCount = async (user) => ({ unread: await prisma.notification.count({ where: { userId: user.id, readAt: null } }) });

export async function markRead(user, body) {
  object(body, ['ids', 'all']);
  const where = { userId: user.id, readAt: null };
  if (!body.all) {
    ensure(Array.isArray(body.ids) && body.ids.length <= 500, 'Daftar notifikasi tidak valid.');
    where.id = { in: body.ids.filter((x) => typeof x === 'string') };
  }
  const r = await prisma.notification.updateMany({ where, data: { readAt: new Date() } });
  return { updated: r.count };
}
