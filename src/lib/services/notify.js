/** Penerima berdasarkan peran. */
export async function recipients(db, roles) {
  const users = await db.user.findMany({ where: { isActive: true, role: { in: roles } }, select: { id: true } });
  return users.map((u) => u.id);
}

/** Buat notifikasi; dedupeKey mencegah pengingat ganda untuk kejadian yang sama. */
export async function notify(db, userIds, { type, title, body, link = null, severity = 'INFO', dedupeKey, dueDate = null }) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return 0;
  const res = await db.notification.createMany({
    data: ids.map((userId) => ({ userId, type, title, body, link, severity, dedupeKey, dueDate })),
    skipDuplicates: true,
  });
  return res.count;
}

export async function notifyRoles(db, roles, payload) {
  return notify(db, await recipients(db, roles), payload);
}
