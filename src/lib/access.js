// Matriks hak akses TQ Finance. Fungsi di sini murni (tanpa database) agar dapat diuji.
// Aplikasi penagihan & invoicing khusus tim finance PT. Total Quality Indonesia.
export const ROLES = ['MANAJER_KEUANGAN', 'STAF_KEUANGAN', 'PIMPINAN'];
export const ROLE_LABELS = {
  MANAJER_KEUANGAN: 'Manajer Keuangan',
  STAF_KEUANGAN: 'Staf Keuangan',
  PIMPINAN: 'Pimpinan / Direksi',
};
const ALL = ROLES;
const FINANCE = ['MANAJER_KEUANGAN', 'STAF_KEUANGAN'];
const MANAGER = ['MANAJER_KEUANGAN'];

export const MODULES = {
  dashboard: { read: ALL },
  account: { read: ALL, write: ALL },
  notifications: { read: ALL, write: ALL },
  contacts: { read: ALL, write: FINANCE },
  projects: { read: ALL, write: FINANCE },
  presenters: { read: ALL, write: FINANCE },
  invoices: { read: ALL, write: FINANCE },
  billing: { read: ALL },
  reports: { read: ALL },
  settings: { read: ALL, write: MANAGER },
  users: { read: MANAGER, write: MANAGER },
  'audit-log': { read: ['MANAJER_KEUANGAN', 'PIMPINAN'] },
};

export function moduleOf(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  return parts[0] === 'api' ? parts[1] : parts[0];
}

export function canAccess(role, pathname, method = 'GET') {
  const rules = MODULES[moduleOf(pathname)];
  if (!rules || !ROLES.includes(role)) return false;
  const list = ['GET', 'HEAD', 'OPTIONS'].includes(method) ? rules.read : rules.write;
  return Boolean(list?.includes(role));
}

export const canWrite = (role, moduleName) => Boolean(MODULES[moduleName]?.write?.includes(role));

export function isSameOriginMutation(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const url = new URL(request.url);
  const host = request.headers.get('host') ?? url.host;
  const protocol = process.env.VERCEL ? 'https:' : url.protocol;
  return origin === `${protocol}//${host}`;
}
