// Mengosongkan data transaksi (Copart, kontrak, termin, invoice, pembayaran, presenter, notifikasi)
// agar bisa diimpor ulang dengan bersih. Akun pengguna, pengaturan & log audit TIDAK dihapus.
//   node --env-file=<env> scripts/reset-data.mjs --yes
import { prisma } from '../src/lib/prisma.js';
import { sequenceKey } from '../src/lib/settings-defaults.js';

if (!process.argv.includes('--yes')) throw new Error('Tambahkan --yes untuk mengonfirmasi penghapusan data transaksi.');

const before = {
  coparts: await prisma.contact.count(), contracts: await prisma.project.count(), termins: await prisma.projectMilestone.count(),
  invoices: await prisma.invoice.count(), payments: await prisma.invoicePayment.count(), presenters: await prisma.presenter.count(),
};

await prisma.$transaction([
  prisma.invoiceFollowUp.deleteMany(),
  prisma.invoicePayment.deleteMany(),
  prisma.projectMilestone.updateMany({ data: { invoiceId: null } }),
  prisma.invoice.deleteMany(),
  prisma.projectMilestone.deleteMany(),
  prisma.project.deleteMany(),
  prisma.contact.deleteMany(),
  prisma.presenter.deleteMany(),
  prisma.notification.deleteMany(),
  prisma.sequence.deleteMany({ where: { OR: [{ key: { startsWith: 'contact-' } }, { key: { startsWith: 'project-' } }] } }),
  // Nomor invoice berikutnya kembali mengikuti "Nomor berikutnya" di Pengaturan.
  prisma.sequence.deleteMany({ where: { key: { in: [sequenceKey('TQ'), sequenceKey('OPS')] } } }),
  prisma.setting.deleteMany({ where: { key: 'import.legacy' } }),
  prisma.auditLog.create({ data: { actorName: 'Reset data', action: 'DELETE', module: 'invoices', note: `Reset data transaksi: ${JSON.stringify(before)}` } }),
]);
console.log('Data transaksi dikosongkan:', before);
await prisma.$disconnect();
