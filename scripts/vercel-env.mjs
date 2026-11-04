// Mengisi environment variable produksi Vercel dari file kredensial lokal (butuh VERCEL_ACCESS_TOKEN di .env).
//   node --env-file=.env scripts/vercel-env.mjs
// AUTH_SECRET & CRON_SECRET produksi dibuat acak sekali lalu disimpan di .env.vercel.production.local
// agar tetap sama pada pemanggilan berikutnya (sesi tidak terputus). Nilai tidak pernah dicetak.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const TEAM = process.env.VERCEL_TEAM_ID || 'team_jrKFfj4dpeprBYtUNxzqICzb';
const PROJECT = process.env.VERCEL_PROJECT_ID || 'prj_JSDvNgYuYcL8qnZ8QHx39cwXTB8C';
const token = process.env.VERCEL_ACCESS_TOKEN;
if (!token) throw new Error('VERCEL_ACCESS_TOKEN diperlukan di .env.');
const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

const read = (file, key) => {
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8').match(new RegExp('^' + key + '="(.*)"', 'm'))?.[1] ?? null;
};

const SECRETS = '.env.vercel.production.local';
let authSecret = read(SECRETS, 'AUTH_SECRET');
let cronSecret = read(SECRETS, 'CRON_SECRET');
if (!authSecret || !cronSecret) {
  authSecret ||= randomBytes(32).toString('base64url');
  cronSecret ||= randomBytes(24).toString('base64url');
  writeFileSync(SECRETS, `# Rahasia produksi Vercel — jangan di-commit.\nAUTH_SECRET="${authSecret}"\nCRON_SECRET="${cronSecret}"\n`);
}
const databaseUrl = read('.env.runtime.production.local', 'DATABASE_URL');
if (!databaseUrl) throw new Error('Jalankan scripts/setup-db.mjs roles terlebih dahulu.');

const vars = [
  { key: 'DATABASE_URL', value: databaseUrl, type: 'encrypted', target: ['production'] },
  { key: 'AUTH_SECRET', value: authSecret, type: 'encrypted', target: ['production', 'preview'] },
  { key: 'CRON_SECRET', value: cronSecret, type: 'encrypted', target: ['production'] },
  { key: 'APP_TIMEZONE', value: 'Asia/Jakarta', type: 'plain', target: ['production', 'preview'] },
];

const res = await fetch(`https://api.vercel.com/v10/projects/${PROJECT}/env?upsert=true&teamId=${TEAM}`, { method: 'POST', headers, body: JSON.stringify(vars) });
const body = await res.json();
if (!res.ok) throw new Error(`Gagal menyimpan env (${res.status}): ${JSON.stringify(body.error ?? body).slice(0, 300)}`);

const patch = await fetch(`https://api.vercel.com/v9/projects/${PROJECT}?teamId=${TEAM}`, { method: 'PATCH', headers, body: JSON.stringify({ nodeVersion: '22.x' }) });
if (!patch.ok) throw new Error('Gagal mengatur versi Node: ' + patch.status);
console.log('Env Vercel diperbarui:', vars.map((v) => `${v.key} [${v.target.join(',')}]`).join(', '), '· Node 22.x');
