import { prisma } from '../prisma.js';
import { addDays, today } from '../dates.js';
import { round2 } from '../domain/billing.js';
import { listInvoices } from './invoices.js';
import { aging } from './reports.js';

// Dashboard penagihan (masukan finance TQ): piutang, kontrak aktif, pendapatan
// bulan ini, omset tahun berjalan, umur piutang, jatuh tempo, follow up, termin siap tagih.
export async function dashboard() {
  const now = today();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const live = { status: { not: 'VOID' } };

  const [ar, month, ytd, received, projects, dueInvoices, followUps, notSent, termins, topClients] = await Promise.all([
    aging(),
    prisma.invoice.aggregate({ where: { ...live, date: { gte: monthStart, lte: now } }, _sum: { dpp: true }, _count: true }),
    prisma.invoice.aggregate({ where: { ...live, date: { gte: yearStart, lte: now } }, _sum: { dpp: true }, _count: true }),
    prisma.invoicePayment.aggregate({ where: { date: { gte: monthStart, lte: now } }, _sum: { amount: true } }),
    prisma.project.aggregate({ where: { status: 'AKTIF' }, _count: true, _sum: { contractValue: true } }),
    prisma.invoice.findMany({ where: { status: { in: ['UNPAID', 'PARTIAL'] }, dueDate: { lte: addDays(now, 14) } }, orderBy: { dueDate: 'asc' }, take: 8, include: { client: { select: { name: true } } } }),
    listInvoices({ status: 'FOLLOW_UP' }, { skip: 0, take: 8 }),
    prisma.invoice.count({ where: { status: { in: ['UNPAID', 'PARTIAL'] }, sentAt: null } }),
    prisma.projectMilestone.findMany({ where: { invoiceId: null, dueDate: { lte: monthEnd }, project: { status: 'AKTIF' } }, orderBy: { dueDate: 'asc' }, take: 8, include: { project: { select: { id: true, name: true, client: { select: { name: true } } } } } }),
    prisma.invoice.groupBy({ by: ['clientId'], where: { ...live, date: { gte: yearStart } }, _sum: { dpp: true }, orderBy: { _sum: { dpp: 'desc' } }, take: 6 }),
  ]);
  const clients = await prisma.contact.findMany({ where: { id: { in: topClients.map((c) => c.clientId) } }, select: { id: true, name: true } });
  const cname = Object.fromEntries(clients.map((c) => [c.id, c.name]));

  return {
    ar: {
      total: ar.totals.total, count: ar.items.length,
      overdue: round2(ar.items.filter((r) => r.bucket !== 'current').reduce((s, r) => s + r.outstanding, 0)),
      buckets: ar.buckets.map(([k, label]) => ({ key: k, label, value: ar.totals[k] })),
    },
    projects: { active: projects._count, contractValue: Number(projects._sum.contractValue ?? 0) },
    month: { revenue: Number(month._sum.dpp ?? 0), count: month._count, received: Number(received._sum.amount ?? 0) },
    ytd: { revenue: Number(ytd._sum.dpp ?? 0), count: ytd._count },
    notSent,
    dueInvoices: dueInvoices.map((i) => ({ id: i.id, number: i.number, party: i.client.name, dueDate: i.dueDate, outstanding: round2(Number(i.total) - Number(i.paid)), overdue: i.dueDate < now })),
    followUps: followUps.rows.map((i) => ({ id: i.id, number: i.number, party: i.client.name, sentAt: i.sentAt, nextFollowUpAt: i.nextFollowUpAt, outstanding: round2(Number(i.total) - Number(i.paid)) })),
    termins: termins.map((m) => ({ id: m.id, projectId: m.project.id, name: m.name, project: m.project.name, party: m.project.client.name, dueDate: m.dueDate, amount: Number(m.amount), late: m.dueDate < now })),
    topClients: topClients.map((c) => ({ name: cname[c.clientId] ?? '-', value: Number(c._sum.dpp ?? 0) })),
  };
}
