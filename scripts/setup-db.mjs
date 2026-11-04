// Menyiapkan database Supabase TQ Finance melalui Management API (butuh SUPABASE_ACCESS_TOKEN di .env).
//   node --env-file=.env scripts/setup-db.mjs roles     → role migrasi + runtime, tulis kredensial .env.*.production.local
//   npm run db:migrate:production                       → terapkan migrasi Prisma sebagai role migrasi
//   node --env-file=.env scripts/setup-db.mjs grants    → hak DML runtime, RLS semua tabel, AuditLog append-only
// Role runtime: NOBYPASSRLS, tanpa hak DDL. Kredensial tidak pernah dicetak ke konsol.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const REF = process.env.SUPABASE_PROJECT_REF || 'gaowwopianxrwcbsutjg';
const API = `https://api.supabase.com/v1/projects/${REF}`;
const SCHEMA = 'public';
const MIGRATE = 'tqf_migrate';
const RUNTIME = 'tqf_runtime';
const MIG_FILE = '.env.migrations.production.local';
const RT_FILE = '.env.runtime.production.local';
const APPEND_ONLY = ['AuditLog'];

const phase = process.argv[2];
if (!['roles', 'grants'].includes(phase)) throw new Error('Pemakaian: setup-db.mjs <roles|grants>');
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN diperlukan di .env.');
const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

const q = (v) => "'" + v.replaceAll("'", "''") + "'";
const ident = (v) => '"' + v.replaceAll('"', '""') + '"';
const passwordFrom = (file, key) => {
  if (!existsSync(file)) return null;
  const m = readFileSync(file, 'utf8').match(new RegExp(key + '="(.*)"'));
  return m ? decodeURIComponent(new URL(m[1]).password) : null;
};

async function sql(query) {
  const res = await fetch(`${API}/database/query`, { method: 'POST', headers, body: JSON.stringify({ query }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`Query gagal (${res.status}): ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

async function poolerHost() {
  const res = await fetch(`${API}/config/database/pooler`, { headers });
  if (!res.ok) throw new Error('Gagal membaca konfigurasi pooler: ' + res.status);
  const row = (await res.json()).find((p) => p.database_type === 'PRIMARY') ?? {};
  if (!row.db_host) throw new Error('Host pooler tidak ditemukan.');
  return row.db_host;
}

// Port 5432 = session pooler (migrasi), 6543 = transaction pooler (runtime aplikasi/Vercel).
const url = (host, role, password, port) => {
  const u = new URL(`postgresql://${host}:${port}/postgres`);
  u.username = `${role}.${REF}`;
  u.password = password;
  u.searchParams.set('sslmode', 'verify-full');
  u.searchParams.set('sslrootcert', 'prisma/certs/supabase-ca.crt');
  u.searchParams.set('schema', SCHEMA);
  return u.toString();
};

if (phase === 'roles') {
  const host = await poolerHost();
  const migPw = passwordFrom(MIG_FILE, 'DIRECT_URL') ?? randomBytes(32).toString('hex');
  const rtPw = passwordFrom(RT_FILE, 'DATABASE_URL') ?? randomBytes(32).toString('hex');
  const role = (name, pw, inherit) => `DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname=${q(name)}) THEN
      CREATE ROLE ${name} LOGIN PASSWORD ${q(pw)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS ${inherit ? 'INHERIT' : 'NOINHERIT'};
    ELSE ALTER ROLE ${name} WITH LOGIN PASSWORD ${q(pw)} NOBYPASSRLS; END IF; END $$;`;
  await sql(`BEGIN;
    ${role(MIGRATE, migPw, true)}
    ${role(RUNTIME, rtPw, false)}
    GRANT USAGE, CREATE ON SCHEMA ${SCHEMA} TO ${MIGRATE};
    GRANT USAGE ON SCHEMA ${SCHEMA} TO ${RUNTIME};
    REVOKE CREATE ON SCHEMA ${SCHEMA} FROM ${RUNTIME};
    ALTER ROLE ${MIGRATE} SET search_path TO ${SCHEMA};
    ALTER ROLE ${RUNTIME} SET search_path TO ${SCHEMA};
    COMMIT;`);
  writeFileSync(MIG_FILE, `# Kredensial migrasi produksi (Supabase ${REF}) — jangan dipakai runtime, jangan di-commit.\nDATABASE_URL="${url(host, MIGRATE, migPw, 5432)}"\nDIRECT_URL="${url(host, MIGRATE, migPw, 5432)}"\n`);
  writeFileSync(RT_FILE, `# Kredensial runtime produksi (Supabase ${REF}) — dipakai aplikasi & Vercel.\nDATABASE_URL="${url(host, RUNTIME, rtPw, 6543)}"\n`);
  console.log(`Role ${MIGRATE} & ${RUNTIME} siap (schema ${SCHEMA}, pooler ${host}). Kredensial: ${MIG_FILE}, ${RT_FILE}`);
} else {
  // Dijalankan sebagai role migrasi (pemilik tabel); Management API berjalan sebagai postgres yang bukan pemilik.
  const { default: pg } = await import('pg');
  const direct = new URL(readFileSync(MIG_FILE, 'utf8').match(/DIRECT_URL="(.*)"/)[1]);
  direct.search = '';
  const client = new pg.Client({ connectionString: direct.toString(), ssl: { ca: readFileSync('prisma/certs/supabase-ca.crt', 'utf8'), rejectUnauthorized: true } });
  await client.connect();
  await client.query(`BEGIN;
    DO $$ DECLARE t record; BEGIN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname=${q(SCHEMA)} AND tablename<>'_prisma_migrations' LOOP
        EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE %I.%I TO ${RUNTIME}', ${q(SCHEMA)}, t.tablename);
        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', ${q(SCHEMA)}, t.tablename);
        IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname=${q(SCHEMA)} AND tablename=t.tablename AND policyname=${q(RUNTIME + '_access')}) THEN
          EXECUTE format('CREATE POLICY ${RUNTIME}_access ON %I.%I TO ${RUNTIME} USING (true) WITH CHECK (true)', ${q(SCHEMA)}, t.tablename);
        END IF;
      END LOOP;
    END $$;
    REVOKE ALL ON TABLE ${SCHEMA}."_prisma_migrations" FROM ${RUNTIME};
    REVOKE UPDATE, DELETE ON ${APPEND_ONLY.map((t) => `${SCHEMA}.${ident(t)}`).join(', ')} FROM ${RUNTIME};
    COMMIT;`);
  await client.end();
  const check = await sql(`SELECT count(*)::int AS tables, count(*) FILTER (WHERE rowsecurity)::int AS rls FROM pg_tables WHERE schemaname=${q(SCHEMA)} AND tablename<>'_prisma_migrations'`);
  console.log(`Hak runtime & RLS diterapkan pada schema ${SCHEMA}:`, check[0]);
}
