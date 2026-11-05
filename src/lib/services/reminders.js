import { prisma } from '../prisma.js';
import { addDays, iso, today } from '../dates.js';
import { round2 } from '../domain/billing.js';
import { idr } from '../labels.js';
import { getSettings } from '../settings.js';
import { listInvoices } from './invoices.js';
import { notifyRoles } from './notify.js';

const FINANCE = ['MANAJER_KEUANGAN', 'STAF_KEUANGAN'];

// Pemindaian pengingat penagihan: jatuh tempo, follow up (SOP H+3 setelah kirim), termin siap ditagih.
export async function runReminders(now = today()) {
  const { 'reminder.thresholds': th } = await getSettings(['reminder.thresholds']);
  let created = 0;
  const due = await prisma.invoice.findMany({ where: { status: { in: ['UNPAID', 'PARTIAL'] }, dueDate: { lte: addDays(now, th.invoiceDueDays) } }, include: { client: { select: { name: true } } } });
  for (const i of due) {
    const late = i.dueDate < now;
    created += await notifyRoles(prisma, FINANCE, {
      type: 'INVOICE_DUE', severity: late ? 'DANGER' : 'WARNING',
      title: `${late ? 'Lewat jatuh tempo' : 'Akan jatuh tempo'}: ${i.number}`,
      body: `${i.client.name} — sisa ${idr(round2(Number(i.total) - Number(i.paid)))}, jatuh tempo ${iso(i.dueDate)}.`,
      link: '/invoices?q=' + encodeURIComponent(i.number), dedupeKey: `inv-${i.id}-${late ? 'late' : 'soon'}`, dueDate: i.dueDate,
    });
  }
  const follow = await listInvoices({ status: 'FOLLOW_UP' }, { skip: 0, take: 500 });
  for (const i of follow.rows) {
    created += await notifyRoles(prisma, FINANCE, {
      type: 'FOLLOW_UP', severity: 'WARNING', title: `Follow up ${i.number}`,
      body: `${i.client.name} — dikirim ${iso(i.sentAt)}, belum lunas.`,
      link: '/invoices?q=' + encodeURIComponent(i.number), dedupeKey: `fu-${i.id}-${iso(i.nextFollowUpAt)}`,
    });
  }
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const termins = await prisma.projectMilestone.findMany({ where: { invoiceId: null, dueDate: { lte: monthEnd }, project: { status: 'AKTIF' } }, include: { project: { select: { id: true, name: true, client: { select: { name: true } } } } } });
  for (const m of termins) {
    created += await notifyRoles(prisma, FINANCE, {
      type: 'TERMIN_DUE', severity: m.dueDate < now ? 'WARNING' : 'INFO', title: `Termin siap ditagih: ${m.project.client.name}`,
      body: `${m.project.name} — ${m.name} ${idr(m.amount)}, rencana ${iso(m.dueDate)}.`,
      link: `/invoices?new=1&projectId=${m.project.id}&milestoneId=${m.id}`, dedupeKey: `termin-${m.id}`,
    });
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
