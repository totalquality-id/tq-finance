// Data contoh penagihan untuk development (JANGAN dijalankan di produksi).
// Semua data dibuat lewat service aplikasi agar perilakunya sama dengan input pengguna.
import { prisma } from '../src/lib/prisma.js';
import { saveContact } from '../src/lib/services/contacts.js';
import { saveProject } from '../src/lib/services/projects.js';
import { addFollowUp, addPayment, createInvoice, markSent } from '../src/lib/services/invoices.js';

if (process.env.VERCEL || process.env.NODE_ENV === 'production') throw new Error('Seed demo hanya untuk development.');
if (await prisma.invoice.count()) {
  console.log('Database sudah berisi invoice; seed demo dilewati.');
  process.exit(0);
}
const user = await prisma.user.findFirst({ where: { role: 'MANAJER_KEUANGAN' } });
if (!user) throw new Error('Jalankan npm run seed terlebih dahulu.');

// Nomor awal seri mengikuti rekap terakhir (TQ 1276, Operasional 2301).
for (const [key, value] of [['invoice-TQ', 1275], ['invoice-OPS', 2300]]) await prisma.sequence.upsert({ where: { key }, create: { key, value }, update: {} });

const copart = (name, shortCode, extra = {}) => saveContact(user, null, { name, shortCode, paymentTermDays: 14, ...extra });
const c = {
  dbg: await copart('PT Dwi Bintang Global', 'DBG', { city: 'Sidoarjo', pic: 'Ibu Rina', npwp: '012345678901000', isPkp: true, address: 'Jl. Raya Industri No. 12, Sidoarjo' }),
  pjm: await copart('PT Prohaba Jaya Mandiri', 'PJM', { city: 'Balikpapan', pic: 'Bpk. Hendra', isPkp: true, paymentTermDays: 30, address: 'Jl. MT Haryono No. 8, Balikpapan' }),
  pks: await copart('PT Peroni Karya Sentra', 'PKS', { city: 'Pasuruan', pic: 'Bpk. Agus', address: 'Kawasan PIER Blok B-5, Pasuruan' }),
  ka: await copart('PT Karunia Abadi', 'CKA', { city: 'Surabaya', pic: 'Ibu Lia', address: 'Jl. Kenjeran No. 101, Surabaya' }),
  pas: await copart('PT Paulin Abadi Sentosa', 'PAS', { city: 'Gresik', pic: 'Bpk. Teguh', address: 'Jl. Veteran No. 3, Gresik' }),
};

const contract = (body) => saveProject(user, null, { status: 'AKTIF', ...body });
const six = (total, start) => ['Tahap Kontrak', 'Bulan Pertama', 'Bulan Kedua', 'Bulan Ketiga', 'Bulan Keempat', 'Bulan Kelima'].map((name, i) => {
  const d = new Date(start); d.setUTCMonth(d.getUTCMonth() + i);
  return { name, percent: 100 / 6, amount: Math.round(total / 6), dueDate: d.toISOString().slice(0, 10) };
});
const k1 = await contract({ name: 'Quality Management System (ISO 9001)', standard: 'Quality Management System (ISO 9001)', clientId: c.dbg.id, serviceType: 'SYSTEM', department: 'CCD', presenter: 'ZOL|YSF', contractNo: 'KTR/TQ/2026/041', contractDate: '2026-06-02', contractValue: 225000000, startDate: '2026-06-05', manager: 'Ammar', milestones: six(225000000, '2026-06-05') });
const k2 = await contract({ name: 'Excellence Management System', standard: 'Excellence Management System', clientId: c.pjm.id, serviceType: 'SYSTEM', department: 'CCD', presenter: 'FHR|YSF', contractNo: 'PO-PJM-26-0177', contractDate: '2026-08-10', contractValue: 480000000, startDate: '2026-08-10', manager: 'Tim SDO',
  milestones: [{ name: 'Tahap DP', percent: 50, amount: 240000000, dueDate: '2026-08-12' }, { name: 'Pelunasan', percent: 50, amount: 240000000, dueDate: '2026-11-20' }] });
const k3 = await contract({ name: 'Audit Maintenance ke-3', standard: 'Audit Maintenance', clientId: c.ka.id, serviceType: 'AUDIT', department: 'CCD', presenter: 'RZK|YSF', contractDate: '2026-09-01', contractValue: 48000000, startDate: '2026-09-15',
  milestones: [{ name: 'Sebelum pelaksanaan audit', percent: 100, amount: 48000000, dueDate: '2026-09-10' }] });
const k4 = await contract({ name: 'Sun Tzu Leadership Training', standard: 'Sun Tzu Leadership Training', clientId: c.pks.id, serviceType: 'TRAINING', department: 'BSD', presenter: 'BLA|JHN', contractDate: '2026-10-01', contractValue: 68100000, startDate: '2026-10-20',
  milestones: [{ name: 'Tahap DP', percent: 50, amount: 34050000, dueDate: '2026-10-05' }, { name: 'Pelunasan', percent: 50, amount: 34050000, dueDate: '2026-11-25' }] });

const ms = async (projectId) => prisma.projectMilestone.findMany({ where: { projectId }, orderBy: { sequence: 'asc' } });
const termin = async (k, idx, date, dueDate, series = 'TQ') => {
  const m = (await ms(k.id))[idx];
  return createInvoice(user, {
    series, category: 'KONTRAK', clientId: k.clientId, projectId: k.id, milestoneId: m.id, date, dueDate, reference: k.contractNo ?? undefined,
    taxMode: series === 'TQ' ? 'PPN_INCLUDED' : 'NONE',
    items: [{ description: `Jasa ${k.name} — ${m.name}`, detail: `Termin ${idx + 1}`, amount: Number(m.amount) }],
  });
};
const send = (inv, sentAt, sentVia = 'EKSPEDISI') => markSent(user, inv.id, { sentAt, sentVia });
const pay = (inv, date, pph = 0) => addPayment(user, inv.id, { date, account: inv.series, amount: Math.round(Number(inv.total) - pph), pph23: pph, buktiPotongNo: pph ? 'BP-' + date.replaceAll('-', '') : undefined });
const pph23 = (inv) => Math.round(Number(inv.dpp) * 0.02);

for (let i = 0; i < 5; i++) {
  const d = `2026-${String(6 + i).padStart(2, '0')}-02`;
  const inv = await termin(k1, i, d, `2026-${String(6 + i).padStart(2, '0')}-16`);
  await send(inv, d.slice(0, 8) + '03');
  if (i < 4) await pay(inv, d.slice(0, 8) + '15', pph23(inv));
}
const dp = await termin(k2, 0, '2026-08-10', '2026-09-09'); await send(dp, '2026-08-11'); await pay(dp, '2026-09-01', pph23(dp));
const au = await termin(k3, 0, '2026-09-08', '2026-09-22'); await send(au, '2026-09-09', 'EMAIL');
await addFollowUp(user, au.id, { date: '2026-09-12', channel: 'TELEPON', note: 'Invoice sudah diterima bagian keuangan, proses approval direksi.', promiseDate: '2026-11-10' });
const tr = await termin(k4, 0, '2026-10-05', '2026-10-19', 'OPS'); await send(tr, '2026-10-06', 'WHATSAPP');
await pay(tr, '2026-10-20');

// Akomodasi (tiket & transportasi konsultan) — seri operasional, format tiket.
const tiket = await createInvoice(user, {
  series: 'OPS', category: 'AKOMODASI', layout: 'TIKET', clientId: c.pjm.id, date: '2026-10-21', dueDate: '2026-11-04', subject: 'Biaya Transportasi — Audit EMS Balikpapan',
  items: [{ description: 'Budi Santoso', route: 'SUB – BPN', ref: 'KQ7X2M', amount: 1650000 }, { description: 'Budi Santoso', route: 'BPN – SUB', ref: 'KQ7X2N', amount: 1725000 }],
});
await send(tiket, '2026-10-22', 'EMAIL');
await createInvoice(user, { series: 'TQ', category: 'LAINNYA', docType: 'KWITANSI', clientId: c.pas.id, date: '2026-11-02', dueDate: '2026-11-16', taxMode: 'PPN_INCLUDED', items: [{ description: 'Add cost pendampingan tambahan QMS', amount: 20000000 }] });

const bcrypt = (await import('bcryptjs')).default;
for (const [name, email, role] of [['Staf Keuangan', 'staf.finance@totalquality.co.id', 'STAF_KEUANGAN'], ['Direktur', 'direktur@totalquality.co.id', 'PIMPINAN']]) {
  if (!(await prisma.user.findUnique({ where: { email } }))) await prisma.user.create({ data: { name, email, role, password: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || 'TqFinance#2026', 12) } });
}
console.log('Seed demo selesai:', await prisma.invoice.count(), 'invoice.');
await prisma.$disconnect();
