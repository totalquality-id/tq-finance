// Data referensi TQ Finance (idempoten, tidak menghapus data):
// bagan akun kantor jasa konsultan, pajak dinamis default, dan akun Manajer Keuangan pertama.
import { prisma } from '../src/lib/prisma.js';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { NORMAL_BALANCE } from '../src/lib/domain/accounting.js';

// [kode, nama, tipe, level, opsi] — opsi: g = grup, c = kas/bank, k = kontra (saldo normal dibalik)
export const COA = [
  ['1000', 'ASET', 'ASSET', 1, 'g'],
  ['1100', 'Aset Lancar', 'ASSET', 2, 'g'],
  ['1101', 'Kas Kantor', 'ASSET', 3, 'c'],
  ['1102', 'Kas Kecil (Petty Cash)', 'ASSET', 3, 'c'],
  ['1111', 'Bank Mandiri — Operasional', 'ASSET', 3, 'c'],
  ['1112', 'Bank BCA', 'ASSET', 3, 'c'],
  ['1131', 'Piutang Usaha', 'ASSET', 3],
  ['1132', 'Piutang Lain-lain', 'ASSET', 3],
  ['1133', 'Pendapatan Belum Ditagih', 'ASSET', 3],
  ['1141', 'Uang Muka Perjalanan Dinas', 'ASSET', 3],
  ['1142', 'Uang Muka Pembelian', 'ASSET', 3],
  ['1151', 'PPN Masukan', 'ASSET', 3],
  ['1152', 'PPh 23 Dibayar Dimuka', 'ASSET', 3],
  ['1153', 'PPh 25 Dibayar Dimuka', 'ASSET', 3],
  ['1161', 'Sewa Dibayar Dimuka', 'ASSET', 3],
  ['1162', 'Biaya Dibayar Dimuka Lainnya', 'ASSET', 3],
  ['1200', 'Aset Tetap', 'ASSET', 2, 'g'],
  ['1201', 'Peralatan Kantor & Komputer', 'ASSET', 3],
  ['1202', 'Furnitur & Inventaris', 'ASSET', 3],
  ['1203', 'Kendaraan', 'ASSET', 3],
  ['1204', 'Bangunan', 'ASSET', 3],
  ['1251', 'Akum. Penyusutan Peralatan & Komputer', 'ASSET', 3, 'k'],
  ['1252', 'Akum. Penyusutan Furnitur & Inventaris', 'ASSET', 3, 'k'],
  ['1253', 'Akum. Penyusutan Kendaraan', 'ASSET', 3, 'k'],
  ['1254', 'Akum. Penyusutan Bangunan', 'ASSET', 3, 'k'],
  ['1300', 'Aset Lain-lain', 'ASSET', 2, 'g'],
  ['1301', 'Uang Jaminan Sewa', 'ASSET', 3],
  ['1302', 'Lisensi Software & Hak Cipta Modul', 'ASSET', 3],

  ['2000', 'KEWAJIBAN', 'LIABILITY', 1, 'g'],
  ['2100', 'Kewajiban Jangka Pendek', 'LIABILITY', 2, 'g'],
  ['2111', 'Hutang Usaha', 'LIABILITY', 3],
  ['2112', 'Hutang Honor Tenaga Ahli', 'LIABILITY', 3],
  ['2121', 'Hutang Reimburse Karyawan', 'LIABILITY', 3],
  ['2122', 'Hutang Gaji', 'LIABILITY', 3],
  ['2123', 'Hutang BPJS', 'LIABILITY', 3],
  ['2131', 'PPN Keluaran', 'LIABILITY', 3],
  ['2132', 'Hutang PPh 23', 'LIABILITY', 3],
  ['2133', 'Hutang PPh 21', 'LIABILITY', 3],
  ['2134', 'Hutang PPh 4 ayat 2', 'LIABILITY', 3],
  ['2135', 'Hutang PPh 29', 'LIABILITY', 3],
  ['2141', 'Uang Muka Klien (Pendapatan Diterima Dimuka)', 'LIABILITY', 3],
  ['2151', 'Biaya Masih Harus Dibayar', 'LIABILITY', 3],
  ['2200', 'Kewajiban Jangka Panjang', 'LIABILITY', 2, 'g'],
  ['2201', 'Hutang Bank', 'LIABILITY', 3],
  ['2202', 'Hutang Leasing Kendaraan', 'LIABILITY', 3],
  ['2203', 'Hutang Pemegang Saham', 'LIABILITY', 3],

  ['3000', 'EKUITAS', 'EQUITY', 1, 'g'],
  ['3100', 'Modal', 'EQUITY', 2, 'g'],
  ['3101', 'Modal Disetor', 'EQUITY', 3],
  ['3102', 'Prive / Dividen', 'EQUITY', 3, 'k'],
  ['3200', 'Saldo Laba', 'EQUITY', 2, 'g'],
  ['3201', 'Laba Ditahan', 'EQUITY', 3],
  ['3202', 'Laba Tahun Berjalan', 'EQUITY', 3],
  ['3901', 'Ekuitas Saldo Awal', 'EQUITY', 3],

  ['4000', 'PENDAPATAN', 'REVENUE', 1, 'g'],
  ['4101', 'Pendapatan Jasa Konsultansi Sistem Manajemen', 'REVENUE', 2],
  ['4102', 'Pendapatan Jasa Audit Internal / Second Party', 'REVENUE', 2],
  ['4103', 'Pendapatan Jasa Pelatihan', 'REVENUE', 2],
  ['4104', 'Pendapatan Pendampingan Sertifikasi', 'REVENUE', 2],
  ['4105', 'Pendapatan E-Learning (TQ Learning)', 'REVENUE', 2],
  ['4109', 'Pendapatan Jasa Lainnya', 'REVENUE', 2],
  ['4901', 'Potongan Penjualan', 'REVENUE', 2, 'k'],

  ['5000', 'BEBAN LANGSUNG PROYEK', 'COST', 1, 'g'],
  ['5101', 'Honor Tenaga Ahli / Konsultan Asosiasi', 'COST', 2],
  ['5102', 'Transportasi Dinas Proyek', 'COST', 2],
  ['5103', 'Akomodasi Dinas Proyek', 'COST', 2],
  ['5104', 'Uang Saku / Per Diem Konsultan', 'COST', 2],
  ['5105', 'Modul, Sertifikat & Konsumsi Pelatihan', 'COST', 2],
  ['5106', 'Sewa Ruang / Venue Pelatihan', 'COST', 2],
  ['5107', 'Biaya Lembaga Sertifikasi Pihak Ketiga', 'COST', 2],
  ['5109', 'Biaya Proyek Lainnya', 'COST', 2],

  ['6000', 'BEBAN OPERASIONAL', 'EXPENSE', 1, 'g'],
  ['6101', 'Gaji & Tunjangan Karyawan', 'EXPENSE', 2],
  ['6102', 'BPJS Kesehatan & Ketenagakerjaan', 'EXPENSE', 2],
  ['6103', 'THR & Bonus', 'EXPENSE', 2],
  ['6111', 'Sewa Kantor', 'EXPENSE', 2],
  ['6112', 'Listrik, Air & Internet', 'EXPENSE', 2],
  ['6113', 'Telepon & Komunikasi', 'EXPENSE', 2],
  ['6114', 'ATK & Perlengkapan Kantor', 'EXPENSE', 2],
  ['6115', 'Langganan Software & Cloud', 'EXPENSE', 2],
  ['6116', 'Pemeliharaan & Perbaikan', 'EXPENSE', 2],
  ['6121', 'Pemasaran & Promosi', 'EXPENSE', 2],
  ['6122', 'Representasi & Jamuan', 'EXPENSE', 2],
  ['6123', 'Perjalanan Dinas Non-Proyek', 'EXPENSE', 2],
  ['6131', 'Jasa Profesional (Notaris, Akuntan, Pajak)', 'EXPENSE', 2],
  ['6132', 'Perizinan & Keanggotaan Asosiasi', 'EXPENSE', 2],
  ['6133', 'Pengembangan SDM & Sertifikasi Auditor', 'EXPENSE', 2],
  ['6141', 'Beban Penyusutan', 'EXPENSE', 2],
  ['6142', 'Beban Amortisasi', 'EXPENSE', 2],
  ['6151', 'Asuransi', 'EXPENSE', 2],
  ['6159', 'Beban Umum Lainnya', 'EXPENSE', 2],

  ['7000', 'PENDAPATAN & BEBAN LAIN-LAIN', 'OTHER_INCOME', 1, 'g'],
  ['7101', 'Pendapatan Jasa Giro / Bunga', 'OTHER_INCOME', 2],
  ['7102', 'Laba Selisih Kurs', 'OTHER_INCOME', 2],
  ['7109', 'Pendapatan Lain-lain', 'OTHER_INCOME', 2],
  ['7201', 'Beban Administrasi Bank', 'OTHER_EXPENSE', 2],
  ['7202', 'Beban Bunga Pinjaman', 'OTHER_EXPENSE', 2],
  ['7203', 'Pajak Jasa Giro', 'OTHER_EXPENSE', 2],
  ['7209', 'Beban Lain-lain', 'OTHER_EXPENSE', 2],

  ['8000', 'PAJAK PENGHASILAN', 'INCOME_TAX', 1, 'g'],
  ['8101', 'Beban PPh Badan', 'INCOME_TAX', 2],
];

// [kode, nama, tarif, jenis, berlaku, akun invoice, akun tagihan]
const TAXES = [
  ['PPN', 'PPN 12% (DPP 11/12)', 11, 'ADDITION', 'BOTH', '2131', '1151'],
  ['PPH23', 'PPh 23 Jasa 2%', 2, 'DEDUCTION', 'BOTH', '1152', '2132'],
  ['PPH21', 'PPh 21 Bukan Pegawai', 2.5, 'DEDUCTION', 'PURCHASE', null, '2133'],
  ['PPH4_2', 'PPh 4(2) Sewa 10%', 10, 'DEDUCTION', 'PURCHASE', null, '2134'],
];

async function main() {
  for (const [code, name, type, level, opt = ''] of COA) {
    const normal = NORMAL_BALANCE[type];
    const normalBalance = opt.includes('k') ? (normal === 'DEBIT' ? 'CREDIT' : 'DEBIT') : normal;
    await prisma.account.upsert({
      where: { code },
      create: { code, name, type, level, normalBalance, isGroup: opt.includes('g'), isCash: opt.includes('c') },
      update: {},
    });
  }
  const acc = Object.fromEntries((await prisma.account.findMany({ select: { id: true, code: true } })).map((a) => [a.code, a.id]));
  for (const [code, name, rate, type, appliesTo, sales, purchase] of TAXES) {
    await prisma.tax.upsert({
      where: { code },
      create: { code, name, rate, type, appliesTo, salesAccountId: sales ? acc[sales] : null, purchaseAccountId: purchase ? acc[purchase] : null },
      update: {},
    });
  }

  const email = (process.env.SEED_ADMIN_EMAIL || 'finance@totalquality.co.id').toLowerCase();
  if (!(await prisma.user.findUnique({ where: { email } }))) {
    const generated = !process.env.SEED_ADMIN_PASSWORD;
    const password = process.env.SEED_ADMIN_PASSWORD || randomBytes(12).toString('base64url');
    await prisma.user.create({ data: { name: 'Manajer Keuangan', email, role: 'MANAJER_KEUANGAN', password: await bcrypt.hash(password, 12) } });
    console.log(`Akun Manajer Keuangan dibuat: ${email}${generated ? ` / kata sandi sementara: ${password}` : ' (kata sandi dari SEED_ADMIN_PASSWORD)'}`);
  }
  console.log(`Seed selesai: ${COA.length} akun, ${TAXES.length} pajak.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
