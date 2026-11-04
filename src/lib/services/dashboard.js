import { prisma } from '../prisma.js';
import { addDays, today } from '../dates.js';
import { round2 } from '../domain/accounting.js';
import { cashAccounts } from './cash.js';
import { aging, profitLoss } from './reports.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export async function dashboard() {
  const now = today();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const chartStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const soon = addDays(now, 14);

  const [cash, ar, ap, ytd, mtd, lines, dueInvoices, dueBills, projects, recent, topClients] = await Promise.all([
    cashAccounts(),
    aging('ar'),
    aging('ap'),
    profitLoss({}),
    profitLoss({ from: monthStart.toISOString().slice(0, 10) }),
    prisma.journalLine.findMany({ where: { date: { gte: chartStart, lte: now }, account: { type: { in: ['REVENUE', 'OTHER_INCOME', 'COST', 'EXPENSE', 'OTHER_EXPENSE', 'INCOME_TAX'] } } }, select: { date: true, debit: true, credit: true, account: { select: { type: true } } } }),
    prisma.invoice.findMany({ where: { status: { in: ['UNPAID', 'PARTIAL'] }, dueDate: { lte: soon } }, orderBy: { dueDate: 'asc' }, take: 8, include: { client: { select: { name: true } } } }),
    prisma.bill.findMany({ where: { status: { in: ['UNPAID', 'PARTIAL'] }, dueDate: { lte: soon } }, orderBy: { dueDate: 'asc' }, take: 8, include: { vendor: { select: { name: true } } } }),
    prisma.project.aggregate({ where: { status: 'AKTIF' }, _count: true, _sum: { contractValue: true } }),
    prisma.journal.findMany({ orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 8, select: { id: true, number: true, date: true, description: true, source: true, totalDebit: true } }),
    prisma.invoice.groupBy({ by: ['clientId'], where: { status: { not: 'VOID' }, date: { gte: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)) } }, _sum: { subtotal: true, discount: true }, orderBy: { _sum: { subtotal: 'desc' } }, take: 6 }),
  ]);

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(chartStart.getUTCFullYear(), chartStart.getUTCMonth() + i, 1));
    return { key: d.toISOString().slice(0, 7), label: `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`, Pendapatan: 0, Beban: 0 };
  });
  const idx = Object.fromEntries(months.map((m, i) => [m.key, i]));
  for (const l of lines) {
    const m = months[idx[new Date(l.date).toISOString().slice(0, 7)]];
    if (!m) continue;
    const t = l.account.type;
    if (t === 'REVENUE' || t === 'OTHER_INCOME') m.Pendapatan += Number(l.credit) - Number(l.debit);
    else m.Beban += Number(l.debit) - Number(l.credit);
  }
  months.forEach((m) => { m.Pendapatan = round2(m.Pendapatan); m.Beban = round2(m.Beban); m.Laba = round2(m.Pendapatan - m.Beban); });

  const clients = await prisma.contact.findMany({ where: { id: { in: topClients.map((c) => c.clientId) } }, select: { id: true, name: true } });
  const cname = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  const overdue = (rows) => round2(rows.filter((r) => r.bucket !== 'current').reduce((s, r) => s + r.outstanding, 0));

  return {
    cash: { accounts: cash, total: round2(cash.reduce((s, a) => s + a.balance, 0)) },
    ar: { total: ar.totals.total, overdue: overdue(ar.items), count: ar.items.length, buckets: ar.buckets.map(([k, label]) => ({ key: k, label, value: ar.totals[k] })) },
    ap: { total: ap.totals.total, overdue: overdue(ap.items), count: ap.items.length },
    ytd: { revenue: ytd.sections.REVENUE.total, net: ytd.net, grossMargin: ytd.grossMargin },
    mtd: { revenue: mtd.sections.REVENUE.total, net: mtd.net },
    projects: { active: projects._count, contractValue: Number(projects._sum.contractValue ?? 0) },
    months,
    dueInvoices: dueInvoices.map((i) => ({ id: i.id, number: i.number, party: i.client.name, dueDate: i.dueDate, outstanding: round2(Number(i.total) - Number(i.paid)), overdue: i.dueDate < now })),
    dueBills: dueBills.map((b) => ({ id: b.id, number: b.number, party: b.vendor.name, dueDate: b.dueDate, outstanding: round2(Number(b.total) - Number(b.paid)), overdue: b.dueDate < now })),
    topClients: topClients.map((c) => ({ name: cname[c.clientId] ?? '-', value: round2(Number(c._sum.subtotal ?? 0) - Number(c._sum.discount ?? 0)) })),
    recent,
  };
}
