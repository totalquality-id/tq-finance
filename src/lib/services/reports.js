import * as XLSX from 'xlsx';
import { prisma } from '../prisma.js';
import { audit } from '../audit.js';
import { iso, today } from '../dates.js';
import { AGING_BUCKETS, DEPARTMENTS, OMZET_EXCLUDED, agingBucket, round2 } from '../domain/billing.js';
import { labelOf } from '../labels.js';
import { getSettings } from '../settings.js';
import { date, ensure } from '../validation.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const yearStart = (d) => new Date(Date.UTC(new Date(d).getUTCFullYear(), 0, 1));

export function parseRange(f, { defaultFrom = 'month' } = {}) {
  const to = f.to ? date(f.to, 'Sampai tanggal') : today();
  const from = f.from ? date(f.from, 'Dari tanggal') : defaultFrom === 'year' ? yearStart(to) : new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  ensure(from <= to, 'Rentang tanggal tidak valid.');
  return { from, to };
}
const yearOf = (f) => (/^\d{4}$/.test(f.year ?? '') ? Number(f.year) : today().getUTCFullYear());

// ─── Laporan pemasukan (untuk Direktur Utama) ────────────────────────────────
export async function incomeReport(f) {
  const { from, to } = parseRange(f);
  const rows = await prisma.invoicePayment.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: [{ date: 'asc' }],
    include: { invoice: { select: { id: true, number: true, series: true, category: true, client: { select: { name: true } }, project: { select: { name: true } }, milestone: { select: { name: true } }, subject: true } } },
  });
  const items = rows.map((p) => ({
    id: p.id, date: p.date, number: p.invoice.number, invoiceId: p.invoice.id, account: p.account, category: p.invoice.category,
    copart: p.invoice.client.name, description: p.invoice.milestone?.name ?? p.invoice.subject ?? p.invoice.project?.name ?? '',
    amount: Number(p.amount), pph23: Number(p.pph23), bankFee: Number(p.bankFee), buktiPotongNo: p.buktiPotongNo,
  }));
  const by = (key) => Object.values(items.reduce((m, r) => {
    const k = r[key];
    m[k] ??= { key: k, amount: 0, pph23: 0, count: 0 };
    m[k].amount = round2(m[k].amount + r.amount); m[k].pph23 = round2(m[k].pph23 + r.pph23); m[k].count++;
    return m;
  }, {})).sort((a, b) => b.amount - a.amount);
  const sum = (k) => round2(items.reduce((s, r) => s + r[k], 0));
  return { from, to, items, byAccount: by('account'), byCopart: by('copart'), totals: { amount: sum('amount'), pph23: sum('pph23'), bankFee: sum('bankFee'), count: items.length } };
}

// ─── Rekap invoice per bulan ─────────────────────────────────────────────────
export async function invoiceRecap(f) {
  const year = yearOf(f);
  const rows = await prisma.invoice.findMany({ where: { status: { not: 'VOID' }, date: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) } }, select: { date: true, series: true, category: true, dpp: true, ppn: true, total: true, paid: true } });
  const months = MONTHS.map((label, i) => ({ month: i + 1, label, count: 0, dpp: 0, ppn: 0, total: 0, paid: 0, TQ: 0, OPS: 0, KONTRAK: 0, AKOMODASI: 0, LAINNYA: 0 }));
  for (const r of rows) {
    const m = months[new Date(r.date).getUTCMonth()];
    m.count++; m.dpp += Number(r.dpp); m.ppn += Number(r.ppn); m.total += Number(r.total); m.paid += Number(r.paid);
    m[r.series] += Number(r.total); m[r.category] += Number(r.total);
  }
  for (const m of months) for (const k of Object.keys(m)) if (typeof m[k] === 'number' && k !== 'month' && k !== 'count') m[k] = round2(m[k]);
  const totals = Object.fromEntries(['count', 'dpp', 'ppn', 'total', 'paid', 'TQ', 'OPS', 'KONTRAK', 'AKOMODASI', 'LAINNYA'].map((k) => [k, round2(months.reduce((s, m) => s + m[k], 0))]));
  return { year, months, totals };
}

// ─── Umur piutang ────────────────────────────────────────────────────────────
export async function aging(f = {}) {
  const asOf = f.to ? date(f.to) : today();
  const docs = await prisma.invoice.findMany({ where: { status: { in: ['UNPAID', 'PARTIAL'] }, date: { lte: asOf }, ...(f.series ? { series: String(f.series) } : {}) }, include: { client: { select: { id: true, name: true, code: true } } }, orderBy: { dueDate: 'asc' } });
  const empty = () => Object.fromEntries(AGING_BUCKETS.map(([k]) => [k, 0]));
  const parties = {};
  const totals = { ...empty(), total: 0 };
  const items = docs.map((d) => {
    const outstanding = round2(Number(d.total) - Number(d.paid));
    const bucket = agingBucket(d.dueDate, asOf);
    const days = Math.max(0, Math.floor((asOf - new Date(d.dueDate)) / 86400000));
    const p = (parties[d.client.id] ??= { id: d.client.id, name: d.client.name, ...empty(), total: 0, count: 0 });
    p[bucket] = round2(p[bucket] + outstanding); p.total = round2(p.total + outstanding); p.count++;
    totals[bucket] = round2(totals[bucket] + outstanding); totals.total = round2(totals.total + outstanding);
    return { id: d.id, number: d.number, series: d.series, party: d.client.name, date: d.date, dueDate: d.dueDate, total: Number(d.total), outstanding, bucket, days };
  });
  return { asOf, buckets: AGING_BUCKETS, parties: Object.values(parties).sort((a, b) => b.total - a.total), items, totals };
}

// ─── Omzet (nilai kontrak) per departemen ───────────────────────────────────
export async function contractAchievement(f) {
  const year = yearOf(f);
  const [{ 'targets.department': targets }, contracts] = await Promise.all([
    getSettings(['targets.department']),
    prisma.project.findMany({ where: { fiscalYear: year }, include: { client: { select: { name: true } } }, orderBy: [{ contractDate: 'asc' }, { client: { name: 'asc' } }] }),
  ]);
  const counted = contracts.filter((c) => !OMZET_EXCLUDED.includes(c.status));
  const depts = DEPARTMENTS.map((d) => {
    const list = counted.filter((c) => c.department === d);
    const achieved = round2(list.reduce((s, c) => s + Number(c.contractValue), 0));
    const target = Number(targets[d] ?? 0);
    return { department: d, target, achieved, count: list.length, pct: target ? round2((achieved / target) * 100) : null };
  });
  const totalTarget = round2(depts.reduce((s, d) => s + d.target, 0));
  const totalAchieved = round2(counted.reduce((s, c) => s + Number(c.contractValue), 0));
  const pending = contracts.filter((c) => c.status === 'MENUNGGU_DP');
  return {
    year, depts,
    totals: { target: totalTarget, achieved: totalAchieved, pct: totalTarget ? round2((totalAchieved / totalTarget) * 100) : null, pending: round2(pending.reduce((s, c) => s + Number(c.contractValue), 0)), pendingCount: pending.length },
    contracts: contracts.map((c) => ({ id: c.id, code: c.code, name: c.name, copart: c.client.name, program: c.standard ?? c.name, department: c.department, presenters: c.presenters, contractDate: c.contractDate, value: Number(c.contractValue), status: c.status, counted: !OMZET_EXCLUDED.includes(c.status), description: c.description })),
  };
}

/** Omzet tahun berjalan (dipakai dashboard). */
export async function omzet(year) {
  const r = await prisma.project.aggregate({ where: { fiscalYear: year, status: { notIn: OMZET_EXCLUDED } }, _sum: { contractValue: true }, _count: true });
  return { value: Number(r._sum.contractValue ?? 0), count: r._count };
}

// ─── Monitoring penagihan (kontrak × bulan) ─────────────────────────────────
export async function billingMonitor(f) {
  const year = yearOf(f);
  const start = new Date(Date.UTC(year, 0, 1)), end = new Date(Date.UTC(year, 11, 31));
  const now = today();
  const [milestones, adhoc] = await Promise.all([
    prisma.projectMilestone.findMany({
      where: { project: { status: { not: 'BATAL' } }, OR: [{ dueDate: { gte: start, lte: end } }, { invoice: { is: { date: { gte: start, lte: end } } } }] },
      include: { project: { select: { id: true, code: true, name: true, standard: true, status: true, description: true, client: { select: { name: true } } } }, invoice: { select: { id: true, number: true, date: true, total: true, paid: true, status: true, dueDate: true } } },
    }),
    prisma.invoice.findMany({ where: { status: { not: 'VOID' }, category: 'KONTRAK', date: { gte: start, lte: end }, milestone: { is: null } }, include: { client: { select: { name: true } }, project: { select: { id: true, code: true, name: true, standard: true, status: true, description: true } } } }),
  ]);
  const rows = {};
  const cell = (rowKey, base, month, entry) => {
    const r = (rows[rowKey] ??= { ...base, months: Array.from({ length: 12 }, () => []), total: 0 });
    r.months[month].push(entry);
    r.total = round2(r.total + entry.amount);
  };
  for (const m of milestones) {
    const inv = m.invoice && m.invoice.status !== 'VOID' ? m.invoice : null;
    const when = inv ? inv.date : m.dueDate;
    if (!when || new Date(when).getUTCFullYear() !== year) continue;
    const state = inv ? (inv.status === 'PAID' ? 'PAID' : new Date(inv.dueDate) < now ? 'OVERDUE' : 'INVOICED') : (m.dueDate && new Date(m.dueDate) < now ? 'LATE' : 'PLANNED');
    cell(m.project.id, { id: m.project.id, code: m.project.code, name: m.project.standard ?? m.project.name, copart: m.project.client.name, status: m.project.status, note: m.project.description }, new Date(when).getUTCMonth(), {
      id: m.id, kind: 'TERMIN', projectId: m.project.id, label: m.name, amount: inv ? Number(inv.total) : Number(m.amount), termAmount: Number(m.amount), dueDate: m.dueDate, notes: m.notes,
      paid: inv ? Number(inv.paid) : 0, state, invoiceId: inv?.id ?? null, number: inv?.number ?? null,
    });
  }
  for (const inv of adhoc) {
    const key = inv.project?.id ?? 'copart-' + inv.clientId;
    const state = inv.status === 'PAID' ? 'PAID' : new Date(inv.dueDate) < now ? 'OVERDUE' : 'INVOICED';
    cell(key, { id: key, code: inv.project?.code ?? '', name: inv.project?.standard ?? inv.project?.name ?? 'Tanpa kontrak', copart: inv.client.name, status: inv.project?.status ?? null, note: inv.project?.description ?? null }, new Date(inv.date).getUTCMonth(), {
      id: inv.id, kind: 'INVOICE', label: inv.subject ?? 'Invoice', amount: Number(inv.total), paid: Number(inv.paid), state, invoiceId: inv.id, number: inv.number, dueDate: inv.dueDate,
    });
  }
  const list = Object.values(rows).sort((a, b) => a.copart.localeCompare(b.copart));
  const months = MONTHS.map((label, i) => {
    const entries = list.flatMap((r) => r.months[i]);
    const target = round2(entries.reduce((s, e) => s + e.amount, 0));
    const collected = round2(entries.reduce((s, e) => s + e.paid, 0));
    return { label, target, collected, outstanding: round2(target - collected), pct: target ? round2((collected / target) * 100) : null };
  });
  const sum = (k) => round2(months.reduce((s, m) => s + m[k], 0));
  const target = sum('target'), collected = sum('collected');
  return { year, rows: list, months, totals: { target, collected, outstanding: round2(target - collected), pct: target ? round2((collected / target) * 100) : null } };
}

export async function report(tab, f) {
  switch (tab) {
    case 'invoices': return invoiceRecap(f);
    case 'aging': return aging(f);
    case 'contracts': return contractAchievement(f);
    default: return incomeReport(f);
  }
}

// ─── Export Excel ────────────────────────────────────────────────────────────
const d = (x) => (x ? iso(x) : '');
function sheetRows(tab, r) {
  switch (tab) {
    case 'income': return r.items.map((x) => ({ Tanggal: d(x.date), 'No. invoice': x.number, Copart: x.copart, Keterangan: x.description, Rekening: labelOf(x.account), Kategori: labelOf(x.category), Diterima: x.amount, 'PPh 23': x.pph23, 'Biaya bank': x.bankFee, 'Bukti potong': x.buktiPotongNo ?? '' }))
      .concat([{ Copart: 'TOTAL', Diterima: r.totals.amount, 'PPh 23': r.totals.pph23, 'Biaya bank': r.totals.bankFee }]);
    case 'invoices': return r.months.map((m) => ({ Bulan: m.label, Jumlah: m.count, DPP: m.dpp, PPN: m.ppn, Total: m.total, 'Seri TQ': m.TQ, 'Seri Operasional': m.OPS, Kontrak: m.KONTRAK, Akomodasi: m.AKOMODASI, Lainnya: m.LAINNYA, Diterima: m.paid }))
      .concat([{ Bulan: 'TOTAL', Jumlah: r.totals.count, DPP: r.totals.dpp, PPN: r.totals.ppn, Total: r.totals.total, 'Seri TQ': r.totals.TQ, 'Seri Operasional': r.totals.OPS, Kontrak: r.totals.KONTRAK, Akomodasi: r.totals.AKOMODASI, Lainnya: r.totals.LAINNYA, Diterima: r.totals.paid }]);
    case 'aging': return r.items.map((x) => ({ Nomor: x.number, Seri: labelOf(x.series), Copart: x.party, Tanggal: d(x.date), 'Jatuh tempo': d(x.dueDate), 'Hari lewat': x.days, Total: x.total, Sisa: x.outstanding, Umur: AGING_BUCKETS.find(([k]) => k === x.bucket)[1] }));
    case 'contracts': return r.contracts.map((c) => ({ 'Tgl kontrak': d(c.contractDate), Copart: c.copart, Program: c.program, Departemen: c.department ? labelOf(c.department) : '', Presenter: c.presenters.join(' | '), Omzet: c.counted ? c.value : 0, 'Nilai kontrak': c.value, Status: labelOf(c.status), Keterangan: c.description ?? '' }));
    case 'billing': return r.rows.map((row) => ({ Copart: row.copart, Kontrak: row.name, ...Object.fromEntries(MONTHS.map((m, i) => [m, round2(row.months[i].reduce((s, e) => s + e.amount, 0)) || ''])), Total: row.total, Keterangan: row.note ?? '' }))
      .concat([{ Copart: 'Target penagihan', ...Object.fromEntries(MONTHS.map((m, i) => [m, r.months[i].target])), Total: r.totals.target }, { Copart: 'Tertagih', ...Object.fromEntries(MONTHS.map((m, i) => [m, r.months[i].collected])), Total: r.totals.collected }, { Copart: 'Outstanding', ...Object.fromEntries(MONTHS.map((m, i) => [m, r.months[i].outstanding])), Total: r.totals.outstanding }]);
    default: return [];
  }
}

export async function exportReport(user, tab, f) {
  const r = tab === 'billing' ? await billingMonitor(f) : await report(tab, f);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows(tab, r)), 'Laporan');
  await audit(null, user, { action: 'EXPORT', module: 'reports', note: `Export ${tab}` });
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function xlsxResponse(buffer, fileName) {
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(fileName),
      'Cache-Control': 'private, no-store',
    },
  });
}
