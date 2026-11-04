import { prisma } from '../prisma.js';
import { addDays, iso, today } from '../dates.js';
import { round2 } from '../domain/accounting.js';
import { idr } from '../labels.js';
import { getSettings } from '../settings.js';
import { notifyRoles } from './notify.js';

const FINANCE = ['MANAJER_KEUANGAN', 'STAF_KEUANGAN'];

// Pemindaian pengingat: invoice & tagihan jatuh tempo, serta tenggat pajak bulanan.
export async function runReminders(now = today()) {
  const { 'reminder.thresholds': th } = await getSettings(['reminder.thresholds']);
  let created = 0;
  const invoices = await prisma.invoice.findMany({ where: { status: { in: ['UNPAID', 'PARTIAL'] }, dueDate: { lte: addDays(now, th.invoiceDueDays) } }, include: { client: { select: { name: true } } } });
  for (const i of invoices) {
    const late = i.dueDate < now;
    created += await notifyRoles(prisma, FINANCE, {
      type: 'INVOICE_DUE', severity: late ? 'DANGER' : 'WARNING',
      title: `${late ? 'Lewat jatuh tempo' : 'Akan jatuh tempo'}: ${i.number}`,
      body: `${i.client.name} — sisa ${idr(round2(Number(i.total) - Number(i.paid)))}, jatuh tempo ${iso(i.dueDate)}.`,
      link: '/invoices?q=' + i.number, dedupeKey: `inv-${i.id}-${late ? 'late' : 'soon'}`, dueDate: i.dueDate,
    });
  }
  const bills = await prisma.bill.findMany({ where: { status: { in: ['UNPAID', 'PARTIAL'] }, dueDate: { lte: addDays(now, th.billDueDays) } }, include: { vendor: { select: { name: true } } } });
  for (const b of bills) {
    const late = b.dueDate < now;
    created += await notifyRoles(prisma, FINANCE, {
      type: 'BILL_DUE', severity: late ? 'DANGER' : 'WARNING',
      title: `Bayar tagihan ${b.number}${late ? ' (terlambat)' : ''}`,
      body: `${b.vendor.name} — sisa ${idr(round2(Number(b.total) - Number(b.paid)))}, jatuh tempo ${iso(b.dueDate)}.`,
      link: '/bills?q=' + b.number, dedupeKey: `bill-${b.id}-${late ? 'late' : 'soon'}`, dueDate: b.dueDate,
    });
  }
  // Tenggat pajak masa (umum): setor PPh potput tgl 15, lapor SPT Masa tgl 20, PPN akhir bulan berikutnya.
  const day = now.getUTCDate();
  const prev = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))).slice(0, 7);
  if (day >= 8 && day <= 15) {
    created += await notifyRoles(prisma, FINANCE, { type: 'TAX_DUE', severity: 'WARNING', title: `Setor PPh 21/23 masa ${prev}`, body: 'Batas setor PPh potong/pungut tanggal 15 bulan ini. Periksa menu Pajak → PPh dipotong.', link: '/tax?tab=withholding&period=' + prev, dedupeKey: 'tax-pph-' + prev });
  }
  if (day >= 20) {
    created += await notifyRoles(prisma, FINANCE, { type: 'TAX_DUE', severity: 'INFO', title: `SPT Masa PPN masa ${prev}`, body: 'Batas setor & lapor SPT Masa PPN akhir bulan ini. Periksa Rekap PPN.', link: '/tax?tab=ppn', dedupeKey: 'tax-ppn-' + prev });
  }
  return { created };
}

let lastRun = 0;
/** Jalankan pemindaian secara malas maksimal sekali per jam per instance. */
export async function maybeRunReminders() {
  if (Date.now() - lastRun < 3600_000) return;
  lastRun = Date.now();
  try { await runReminders(); } catch (e) { console.error('reminders', e.message); }
}
