import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { supabaseCa } from './supabase-ca.js';
import { serialize } from './serialization.js';

const globalForPrisma = globalThis;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL belum dikonfigurasi.');
  const url = new URL(connectionString);
  const local = LOCAL_HOSTS.has(url.hostname);
  if (!local || process.env.VERCEL) {
    // pg URL SSL options override the explicit CA; keep filesystem paths CLI-only.
    url.searchParams.delete('sslrootcert');
    url.searchParams.delete('sslmode');
  }
  const schema = url.searchParams.get('schema') ?? 'public';
  url.searchParams.delete('schema');
  const adapter = new PrismaPg({
    connectionString: url.toString(),
    ...(local && !process.env.VERCEL ? {} : { ssl: { ca: supabaseCa, rejectUnauthorized: true } }),
    max: local ? 1 : 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
  }, { schema });

  return new PrismaClient({
    adapter,
    omit: { user: { password: true } },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  }).$extends({ query: { async $allOperations({ args, query }) { return serialize(await query(args)); } } });
}

// Klien dibuat saat pertama dipakai (bukan saat modul diimpor) agar build Next.js
// tidak membutuhkan DATABASE_URL ketika mengumpulkan data halaman/route.
const client = () => (globalForPrisma.prisma ??= createPrismaClient());

export const prisma = new Proxy({}, {
  get(_, key) {
    const c = client();
    const value = c[key];
    return typeof value === 'function' ? value.bind(c) : value;
  },
});
