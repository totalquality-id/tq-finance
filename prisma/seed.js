// Data awal TQ Finance (idempoten): akun Manajer Keuangan pertama.
// Rekening, penanda tangan, stempel & nomor awal invoice diatur di /settings
// atau lewat scripts/apply-invoice-settings.mjs (data internal, tidak di-commit).
import { prisma } from '../src/lib/prisma.js';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL || 'finance@totalquality.co.id').toLowerCase();
  if (!(await prisma.user.findUnique({ where: { email } }))) {
    const generated = !process.env.SEED_ADMIN_PASSWORD;
    const password = process.env.SEED_ADMIN_PASSWORD || randomBytes(12).toString('base64url');
    await prisma.user.create({ data: { name: 'Manajer Keuangan', email, role: 'MANAJER_KEUANGAN', password: await bcrypt.hash(password, 12) } });
    console.log(`Akun Manajer Keuangan dibuat: ${email}${generated ? ` / kata sandi sementara: ${password}` : ' (kata sandi dari SEED_ADMIN_PASSWORD)'}`);
  }
  console.log('Seed selesai.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
