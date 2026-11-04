// Data contoh untuk development (JANGAN dijalankan di produksi).
// Seluruh transaksi dibuat lewat service aplikasi sehingga jurnalnya identik dengan input pengguna.
import { prisma } from '../src/lib/prisma.js';
import { saveContact } from '../src/lib/services/contacts.js';
import { saveProject } from '../src/lib/services/projects.js';
import { addInvoicePayment, createInvoice } from '../src/lib/services/invoices.js';
import { addBillPayment, createBill } from '../src/lib/services/bills.js';
import { saveCash } from '../src/lib/services/cash.js';
import { createJournal } from '../src/lib/services/journals.js';
import { runDepreciation, saveAsset } from '../src/lib/services/assets.js';
import { createTaxPayment } from '../src/lib/services/tax.js';

if (process.env.VERCEL || process.env.NODE_ENV === 'production') throw new Error('Seed demo hanya untuk development.');
if (await prisma.journal.count()) {
  console.log('Database sudah berisi jurnal; seed demo dilewati.');
  process.exit(0);
}

const user = await prisma.user.findFirst({ where: { role: 'MANAJER_KEUANGAN' } });
if (!user) throw new Error('Jalankan npm run seed terlebih dahulu.');
const A = Object.fromEntries((await prisma.account.findMany()).map((a) => [a.code, a.id]));
const T = Object.fromEntries((await prisma.tax.findMany()).map((t) => [t.code, t.id]));

const contact = (type, name, extra = {}) => saveContact(user, null, { type, name, paymentTermDays: 30, isActive: true, ...extra });
const clients = {
  dbg: await contact('CLIENT', 'PT Dwi Bintang Global', { industry: 'Garmen CMT', city: 'Sidoarjo', pic: 'Ibu Rina', npwp: '012345678901000', isPkp: true }),
  pjm: await contact('CLIENT', 'PT Prohaba Jaya Mandiri', { industry: 'Kontraktor pertambangan', city: 'Balikpapan', pic: 'Bpk. Hendra', npwp: '023456789012000', isPkp: true, paymentTermDays: 45 }),
  pks: await contact('CLIENT', 'PT Peroni Karya Sentra', { industry: 'Manufaktur', city: 'Pasuruan', pic: 'Bpk. Agus' }),
  ka: await contact('CLIENT', 'PT Karunia Abadi', { industry: 'Distribusi', city: 'Surabaya', pic: 'Ibu Lia', paymentTermDays: 14 }),
  gi: await contact('CLIENT', 'PT Globalindo Intimates', { industry: 'Garmen ekspor', city: 'Klaten', pic: 'Ibu Desi', npwp: '034567890123000', isPkp: true }),
};
const vendors = {
  ls: await contact('VENDOR', 'PT Lembaga Sertifikasi Nusantara', { industry: 'Lembaga sertifikasi ISO', city: 'Jakarta', isPkp: true, npwp: '045678901234000', bankName: 'BCA', bankAccount: '1234567890', bankHolder: 'PT LSN' }),
  hotel: await contact('VENDOR', 'Hotel Santika Surabaya', { industry: 'Venue & akomodasi', city: 'Surabaya' }),
  travel: await contact('VENDOR', 'CV Tiket Kita Travel', { industry: 'Tiket perjalanan', city: 'Surabaya' }),
  landlord: await contact('VENDOR', 'Bpk. Sutrisno (Pemilik Ruko)', { industry: 'Sewa kantor', city: 'Surabaya' }),
  budi: await contact('ASSOCIATE', 'Budi Santoso, Lead Auditor', { industry: 'Lead auditor ISO 9001/14001', city: 'Malang', bankName: 'Mandiri', bankAccount: '1410009876543', bankHolder: 'Budi Santoso' }),
  sari: await contact('ASSOCIATE', 'Sari Wulandari, Trainer K3', { industry: 'Trainer ISO 45001', city: 'Surabaya', bankName: 'BRI', bankAccount: '0021010099887', bankHolder: 'Sari Wulandari' }),
};

// Saldo awal 1 Januari 2026.
await createJournal(user, {
  date: '2026-01-01', description: 'Saldo awal pembukuan TQ Finance', source: 'OPENING', reference: 'SA-2026',
  lines: [
    { accountId: A['1111'], debit: 285000000, credit: 0 },
    { accountId: A['1101'], debit: 5000000, credit: 0 },
    { accountId: A['1201'], debit: 72000000, credit: 0 },
    { accountId: A['1251'], debit: 0, credit: 18000000 },
    { accountId: A['3101'], debit: 0, credit: 250000000 },
    { accountId: A['3201'], debit: 0, credit: 94000000 },
  ],
});

const project = (body) => saveProject(user, null, { status: 'AKTIF', ...body });
const p1 = await project({ name: 'Pendampingan Sertifikasi ISO 9001:2015', clientId: clients.dbg.id, serviceType: 'SERTIFIKASI', standard: 'ISO 9001:2015', contractNo: 'SPK/DBG/2026/041', contractDate: '2026-06-02', contractValue: 120000000, budgetCost: 55000000, startDate: '2026-06-05', endDate: '2026-12-15', manager: 'Ammar',
  milestones: [{ name: 'DP / Uang muka', percent: 30, amount: 36000000, dueDate: '2026-06-10' }, { name: 'Progres implementasi & audit internal', percent: 40, amount: 48000000, dueDate: '2026-09-15' }, { name: 'Pelunasan setelah sertifikasi', percent: 30, amount: 36000000, dueDate: '2026-12-15' }] });
const p2 = await project({ name: 'Implementasi Sistem Manajemen K3 ISO 45001 (E-HSE)', clientId: clients.pjm.id, serviceType: 'KONSULTANSI', standard: 'ISO 45001:2018', contractNo: 'PO-PJM-26-0177', contractDate: '2026-07-01', contractValue: 185000000, budgetCost: 70000000, startDate: '2026-07-07', endDate: '2027-01-31', manager: 'Tim HSE TQ',
  milestones: [{ name: 'Termin 1 — Gap analysis', percent: 25, amount: 46250000, dueDate: '2026-07-20' }, { name: 'Termin 2 — Dokumentasi', percent: 35, amount: 64750000, dueDate: '2026-10-01' }, { name: 'Termin 3 — Audit & closing', percent: 40, amount: 74000000, dueDate: '2027-01-31' }] });
const p3 = await project({ name: 'In-house Training Internal Auditor ISO 9001', clientId: clients.pks.id, serviceType: 'PELATIHAN', standard: 'ISO 19011', contractNo: 'PKS/HRD/2026/88', contractValue: 32000000, budgetCost: 12000000, startDate: '2026-08-18', endDate: '2026-08-20', manager: 'Sari W.',
  milestones: [{ name: 'Pelunasan setelah training', percent: 100, amount: 32000000, dueDate: '2026-08-21' }] });
const p4 = await project({ name: 'Audit Second Party Supplier', clientId: clients.gi.id, serviceType: 'AUDIT', standard: 'ISO 9001 / WRAP', contractValue: 45000000, budgetCost: 18000000, startDate: '2026-09-21', endDate: '2026-10-30', manager: 'Budi S.',
  milestones: [{ name: 'Laporan audit', percent: 100, amount: 45000000, dueDate: '2026-10-30' }] });

const ms = async (projectId) => prisma.projectMilestone.findMany({ where: { projectId }, orderBy: { sequence: 'asc' } });
const termin = async (p, idx, date, dueDate, taxes = ['PPN', 'PPH23']) => {
  const m = (await ms(p.id))[idx];
  return createInvoice(user, {
    clientId: p.clientId, projectId: p.id, milestoneId: m.id, date, dueDate, reference: p.contractNo ?? undefined,
    items: [{ description: `${p.name} — ${m.name}`, quantity: 1, unit: 'termin', unitPrice: Number(m.amount) }],
    taxIds: taxes.map((c) => T[c]), revenueAccountId: A[{ SERTIFIKASI: '4104', KONSULTANSI: '4101', PELATIHAN: '4103', AUDIT: '4102' }[p.serviceType]],
  });
};
const receive = (inv, date, ratio = 1, fee = 0) => addInvoicePayment(user, inv.id, { date, cashAccountId: A['1111'], amount: Math.round(Number(inv.total) * ratio), bankFee: fee });

const i1 = await termin(p1, 0, '2026-06-08', '2026-07-08'); await receive(i1, '2026-06-30', 1, 6500);
const i2 = await termin(p2, 0, '2026-07-15', '2026-08-29'); await receive(i2, '2026-08-25');
const i3 = await termin(p3, 0, '2026-08-21', '2026-09-20', ['PPH23']); await receive(i3, '2026-09-18');
const i4 = await termin(p1, 1, '2026-09-15', '2026-10-15'); await receive(i4, '2026-10-20', 0.5);
await termin(p2, 1, '2026-10-01', '2026-11-15');
await termin(p4, 0, '2026-10-30', '2026-11-29');
const ka = await createInvoice(user, { clientId: clients.ka.id, date: '2026-09-02', dueDate: '2026-09-16', items: [{ description: 'Public training Awareness ISO 9001:2015 (3 peserta)', quantity: 3, unit: 'peserta', unitPrice: 1750000 }], taxIds: [], revenueAccountId: A['4103'] });
void ka; // dibiarkan lewat jatuh tempo untuk contoh umur piutang

// Tagihan vendor & tenaga ahli.
const bill = (vendorId, date, dueDate, items, taxes = [], projectId) => createBill(user, { vendorId, projectId, date, dueDate, items, taxIds: taxes.map((c) => T[c]) });
const pay = (b, date) => addBillPayment(user, b.id, { date, cashAccountId: A['1111'], amount: Number(b.total) });
const b1 = await bill(vendors.budi.id, '2026-07-31', '2026-08-07', [{ description: 'Honor lead auditor — gap analysis PJM (5 hari)', accountId: A['5101'], quantity: 5, unitPrice: 2500000 }], ['PPH21'], p2.id); await pay(b1, '2026-08-05');
const b2 = await bill(vendors.sari.id, '2026-08-20', '2026-08-27', [{ description: 'Honor trainer in-house internal auditor (3 hari)', accountId: A['5101'], quantity: 3, unitPrice: 2000000 }], ['PPH21'], p3.id); await pay(b2, '2026-08-26');
const b3 = await bill(vendors.hotel.id, '2026-08-20', '2026-09-05', [{ description: 'Sewa meeting room & coffee break 3 hari', accountId: A['5106'], quantity: 3, unitPrice: 1850000 }, { description: 'Modul & sertifikat peserta', accountId: A['5105'], quantity: 20, unitPrice: 85000 }], [], p3.id); await pay(b3, '2026-09-03');
const b4 = await bill(vendors.ls.id, '2026-10-12', '2026-11-11', [{ description: 'Biaya audit sertifikasi stage 1 & 2 — PT DBG', accountId: A['5107'], quantity: 1, unitPrice: 28000000 }], ['PPN', 'PPH23'], p1.id);
void b4;
const b5 = await bill(vendors.travel.id, '2026-09-22', '2026-10-06', [{ description: 'Tiket pesawat SUB–SOC PP auditor', accountId: A['5102'], quantity: 2, unitPrice: 1650000 }], [], p4.id); await pay(b5, '2026-10-01');
const b6 = await bill(vendors.landlord.id, '2026-07-01', '2026-07-10', [{ description: 'Sewa ruko kantor Juli–Desember 2026', accountId: A['1161'], quantity: 6, unitPrice: 4500000 }], ['PPH4_2']); await pay(b6, '2026-07-08');

// Pengeluaran rutin kantor (Jun–Okt).
const out = (date, description, lines, counterparty, projectId) => saveCash(user, null, { type: 'OUT', date, cashAccountId: A['1111'], description, counterparty, projectId, lines });
for (const m of ['06', '07', '08', '09', '10']) {
  await out(`2026-${m}-25`, `Gaji karyawan ${m}/2026`, [{ accountId: A['6101'], amount: 21500000 }, { accountId: A['6102'], amount: 1650000 }], 'Karyawan TQ');
  await out(`2026-${m}-10`, `Listrik, air & internet ${m}/2026`, [{ accountId: A['6112'], amount: 2350000 }], 'PLN / Indihome');
  await out(`2026-${m}-05`, `Langganan software & cloud ${m}/2026`, [{ accountId: A['6115'], amount: 1150000 }], 'Google Workspace, Vercel');
  await saveCash(user, null, { type: 'IN', date: `2026-${m}-28`, cashAccountId: A['1111'], description: `Jasa giro ${m}/2026`, lines: [{ accountId: A['7101'], amount: 185000 }] });
  // Amortisasi sewa dibayar dimuka mulai Juli.
  if (m !== '06') await createJournal(user, { date: `2026-${m}-28`, description: `Amortisasi sewa kantor ${m}/2026`, lines: [{ accountId: A['6111'], debit: 4500000, credit: 0 }, { accountId: A['1161'], debit: 0, credit: 4500000 }] });
}
await out('2026-08-19', 'Transport & konsumsi tim training PKS', [{ accountId: A['5102'], amount: 850000 }, { accountId: A['5104'], amount: 1200000 }], 'Tim trainer', p3.id);
await out('2026-09-24', 'Per diem auditor 4 hari — audit Klaten', [{ accountId: A['5104'], amount: 2400000 }, { accountId: A['5103'], amount: 3200000 }], 'Budi S.', p4.id);
await out('2026-10-14', 'Pendaftaran pelatihan Lead Auditor ISO 45001 (IRCA) staf', [{ accountId: A['6133'], amount: 7500000 }], 'Lembaga training');
await saveCash(user, null, { type: 'TRANSFER', date: '2026-09-01', cashAccountId: A['1111'], toAccountId: A['1102'], description: 'Isi ulang kas kecil', amount: 3000000 });
await saveCash(user, null, { type: 'OUT', date: '2026-09-17', cashAccountId: A['1102'], description: 'ATK & materai', lines: [{ accountId: A['6114'], amount: 640000 }] });

// Aset tetap & penyusutan.
await saveAsset(user, null, { name: 'Laptop konsultan (4 unit) — saldo awal', category: 'KOMPUTER', acquisitionDate: '2025-01-02', cost: 72000000, residualValue: 0, usefulLifeMonths: 48, assetAccountId: A['1201'], accumAccountId: A['1251'], expenseAccountId: A['6141'], location: 'Tim konsultan' });
await saveAsset(user, null, { name: 'Proyektor & layar training', category: 'PERALATAN', acquisitionDate: '2026-06-03', cost: 9600000, residualValue: 0, usefulLifeMonths: 48, assetAccountId: A['1201'], accumAccountId: A['1251'], expenseAccountId: A['6141'], location: 'Ruang training' });
await out('2026-06-03', 'Pembelian proyektor & layar training', [{ accountId: A['1201'], amount: 9600000 }], 'Toko Elektronik');
// Akumulasi saldo awal (Jan 2025–Des 2025 = 12 bulan × 1,5 jt) sudah ada di jurnal saldo awal.
for (let m = 1; m <= 12; m++) {
  const per = `2025-${String(m).padStart(2, '0')}`;
  const asset = await prisma.fixedAsset.findFirst({ where: { name: { startsWith: 'Laptop' } } });
  await prisma.assetDepreciation.create({ data: { assetId: asset.id, period: per, amount: 1500000, journalId: 'saldo-awal' } });
}
for (const m of ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']) await runDepreciation(user, { period: `2026-${m}` });

// Setoran PPh 21 masa Agustus.
await createTaxPayment(user, { taxCode: 'PPH21', period: '2026-08', date: '2026-09-12', cashAccountId: A['1111'], taxAccountId: A['2133'], amount: 450000, billingCode: '012345678901234', ntpn: 'A1B2C3D4E5F6G7H8' });

// Pengguna contoh lain.
const bcrypt = (await import('bcryptjs')).default;
for (const [name, email, role] of [['Staf Keuangan', 'staf.finance@totalquality.co.id', 'STAF_KEUANGAN'], ['Direktur', 'direktur@totalquality.co.id', 'PIMPINAN']]) {
  if (!(await prisma.user.findUnique({ where: { email } }))) await prisma.user.create({ data: { name, email, role, password: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || 'TqFinance#2026', 12) } });
}

console.log('Seed demo selesai:', await prisma.journal.count(), 'jurnal.');
await prisma.$disconnect();
