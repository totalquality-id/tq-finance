const HIDDEN = /(Hash|password)$/i;

// Field rahasia tidak pernah ditulis ke audit log dalam bentuk terbuka.
export function redact(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(redact);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, HIDDEN.test(k) ? (v ? '[dilindungi]' : null) : redact(v)]));
  }
  return value;
}

export const actorName = (user) => user?.name ?? 'Sistem';

/** Catat perubahan penting. Gunakan `db` = transaksi agar audit ikut gagal bila transaksi gagal. */
export async function audit(db, user, { action, module, recordId = null, before = null, after = null, note = null }) {
  const client = db ?? (await import('./prisma.js')).prisma;
  return client.auditLog.create({
    data: {
      userId: user?.id ?? null,
      actorName: actorName(user),
      action,
      module,
      recordId,
      before: redact(before) ?? undefined,
      after: redact(after) ?? undefined,
      note,
    },
  });
}

// Simpan hanya field yang berubah agar log ringkas tetapi tetap memuat data sebelum/sesudah.
export function diff(before, after) {
  const b = {}, a = {};
  for (const key of Object.keys(after)) {
    const x = before?.[key], y = after[key];
    const norm = (v) => (v instanceof Date ? v.toISOString() : v === undefined ? null : JSON.stringify(v));
    if (norm(x) !== norm(y)) { b[key] = x ?? null; a[key] = y ?? null; }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
