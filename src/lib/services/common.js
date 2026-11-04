import { canWrite } from '../access.js';
import { InputError } from '../validation.js';

export function requireWrite(user, moduleName) {
  if (!canWrite(user.role, moduleName)) throw new InputError('Anda tidak memiliki izin mengubah data ini.', 403);
}

export const groupBy = (rows, key) =>
  rows.reduce((m, r) => {
    (m[r[key]] ??= []).push(r);
    return m;
  }, {});

export const sumBy = (rows, fn) => rows.reduce((s, r) => s + Number(fn(r) || 0), 0);

/** Filter teks pencarian sederhana untuk beberapa field (mendukung relasi "client.name"). */
export function searchOr(q, fields) {
  if (!q) return undefined;
  const term = String(q).slice(0, 80);
  return fields.map((f) => f.split('.').reduceRight((acc, p) => ({ [p]: acc }), { contains: term, mode: 'insensitive' }));
}
