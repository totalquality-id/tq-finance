import * as XLSX from 'xlsx';
import { prisma } from '../prisma.js';
import { audit } from '../audit.js';
import { addDays, iso, today } from '../dates.js';
import { AGING_BUCKETS, PL_TYPES, agingBucket, cashFlowActivity, round2, signed } from '../domain/accounting.js';
import { LABELS } from '../labels.js';
import { date, ensure, id as idOf } from '../validation.js';
import { balancesByAccount } from './accounts.js';
import { accountMapping } from './ledger.js';
import { projectFinancials } from './projects.js';

// Tanda alami per tipe: kredit-positif untuk pendapatan, debit-positif untuk beban.
const CREDIT_TYPES = ['LIABILITY', 'EQUITY', 'REVENUE', 'OTHER_INCOME'];
const natural = (type, d, c) => round2(CREDIT_TYPES.includes(type) ? c - d : d - c);

const yearStart = (d) => new Date(Date.UTC(new Date(d).getUTCFullYear(), 0, 1));
const detailAccounts = () => prisma.account.findMany({ where: { isGroup: false }, orderBy: { code: 'asc' } });

export function parseRange(f, { defaultFrom = 'year' } = {}) {
  const to = f.to ? date(f.to, 'Sampai tanggal') : today();
  const from = f.from ? date(f.from, 'Dari tanggal') : defaultFrom === 'month' ? new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1)) : yearStart(to);
  ensure(from <= to, 'Rentang tanggal tidak valid.');
  return { from, to };
}

// ─── Neraca saldo ────────────────────────────────────────────────────────────
export async function trialBalance(f) {
  const to = f.to ? date(f.to) : today();
  const [accounts, bal] = await Promise.all([detailAccounts(), balancesByAccount({ to })]);
  const rows = accounts.filter((a) => bal[a.id]).map((a) => {
    const b = bal[a.id];
    const net = round2(b.debit - b.credit);
    return { id: a.id, code: a.code, name: a.name, type: a.type, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 };
  });
  return { to, rows, totalDebit: round2(rows.reduce((s, r) => s + r.debit, 0)), totalCredit: round2(rows.reduce((s, r) => s + r.credit, 0)) };
}

// ─── Laba rugi ───────────────────────────────────────────────────────────────
export async function profitLoss(f) {
  const { from, to } = parseRange(f);
  const projectId = f.projectId ? idOf(f.projectId, 'Proyek') : undefined;
  const [accounts, bal] = await Promise.all([detailAccounts(), balancesByAccount({ from, to, projectId })]);
  const sections = Object.fromEntries(PL_TYPES.map((t) => [t, { type: t, label: LABELS[t], rows: [], total: 0 }]));
  for (const a of accounts) {
    if (!sections[a.type] || !bal[a.id]) continue;
    const amount = natural(a.type, bal[a.id].debit, bal[a.id].credit);
    if (!amount) continue;
    sections[a.type].rows.push({ id: a.id, code: a.code, name: a.name, amount });
    sections[a.type].total = round2(sections[a.type].total + amount);
  }
  const t = (k) => sections[k].total;
  const gross = round2(t('REVENUE') - t('COST'));
  const operating = round2(gross - t('EXPENSE'));
  const beforeTax = round2(operating + t('OTHER_INCOME') - t('OTHER_EXPENSE'));
  const net = round2(beforeTax - t('INCOME_TAX'));
  return { from, to, projectId: projectId ?? null, sections, gross, operating, beforeTax, net, grossMargin: t('REVENUE') ? round2((gross / t('REVENUE')) * 100) : 0 };
}

/** Laba bersih (semua akun L/R) untuk rentang tanggal; to inklusif. */
async function netIncome(from, to) {
  if (from && to && from > to) return 0;
  const [accounts, bal] = await Promise.all([prisma.account.findMany({ where: { type: { in: PL_TYPES } }, select: { id: true, type: true } }), balancesByAccount({ from, to })]);
  return round2(accounts.reduce((s, a) => s + (bal[a.id] ? (bal[a.id].credit - bal[a.id].debit) : 0), 0));
}

// ─── Neraca ──────────────────────────────────────────────────────────────────
export async function balanceSheet(f) {
  const to = f.to ? date(f.to) : today();
  const [accounts, bal, map] = await Promise.all([prisma.account.findMany({ orderBy: { code: 'asc' } }), balancesByAccount({ to }), accountMapping()]);
  const ys = yearStart(to);
  const [prior, current] = await Promise.all([netIncome(undefined, addDays(ys, -1)), netIncome(ys, to)]);
  const groups = accounts.filter((a) => a.isGroup && ['ASSET', 'LIABILITY', 'EQUITY'].includes(a.type) && a.level === 2);
  const section = (type) => {
    const details = accounts.filter((a) => !a.isGroup && a.type === type);
    const rows = details.map((a) => ({ id: a.id, code: a.code, name: a.name, amount: bal[a.id] ? natural(type, bal[a.id].debit, bal[a.id].credit) : 0 }));
    if (type === 'EQUITY') {
      const re = rows.find((r) => r.code === map.retainedEarnings?.code);
      if (re) re.amount = round2(re.amount + prior); else rows.push({ id: 're', code: '', name: 'Laba ditahan', amount: prior });
      const ce = rows.find((r) => r.code === map.currentEarnings?.code);
      if (ce) ce.amount = round2(ce.amount + current); else rows.push({ id: 'ce', code: '', name: 'Laba tahun berjalan', amount: current });
    }
    const visible = rows.filter((r) => r.amount);
    // Kelompokkan per sub-grup (level 2) berdasarkan awalan kode.
    const subs = groups.filter((g) => g.type === type).map((g) => {
      const p = g.code.replace(/0+$/, '');
      const items = visible.filter((r) => r.code.startsWith(p));
      return { code: g.code, name: g.name, rows: items, total: round2(items.reduce((s, r) => s + r.amount, 0)) };
    }).filter((s) => s.rows.length);
    const loose = visible.filter((r) => !subs.some((s) => s.rows.includes(r)));
    if (loose.length) subs.push({ code: '', name: type === 'EQUITY' ? 'Ekuitas lainnya' : 'Lainnya', rows: loose, total: round2(loose.reduce((s, r) => s + r.amount, 0)) });
    return { type, label: LABELS[type], subs, total: round2(visible.reduce((s, r) => s + r.amount, 0)) };
  };
  const assets = section('ASSET'), liabilities = section('LIABILITY'), equity = section('EQUITY');
  return { to, assets, liabilities, equity, totalLE: round2(liabilities.total + equity.total), balanced: Math.abs(assets.total - liabilities.total - equity.total) < 1, currentEarnings: current };
}

// ─── Arus kas (metode langsung, dialokasikan ke akun lawan) ─────────────────
export async function cashFlow(f) {
  const { from, to } = parseRange(f);
  const accounts = await prisma.account.findMany({ select: { id: true, code: true, name: true, type: true, isCash: true } });
  const byId = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const cashIds = accounts.filter((a) => a.isCash).map((a) => a.id);
  const journals = await prisma.journal.findMany({ where: { date: { gte: from, lte: to }, source: { not: 'OPENING' }, lines: { some: { accountId: { in: cashIds } } } }, select: { id: true, lines: { select: { accountId: true, debit: true, credit: true } } } });
  const acts = { OPERATING: {}, INVESTING: {}, FINANCING: {} };
  for (const j of journals) {
    const cashNet = j.lines.filter((l) => byId[l.accountId].isCash).reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
    const others = j.lines.filter((l) => !byId[l.accountId].isCash);
    const weight = others.reduce((s, l) => s + Math.abs(Number(l.debit) - Number(l.credit)), 0);
    if (!others.length || !weight || Math.abs(cashNet) < 0.005) continue; // transfer antar kas
    for (const l of others) {
      const share = (cashNet * Math.abs(Number(l.debit) - Number(l.credit))) / weight;
      const a = byId[l.accountId];
      const act = acts[cashFlowActivity(a)];
      act[a.id] ??= { code: a.code, name: a.name, inflow: 0, outflow: 0 };
      if (share >= 0) act[a.id].inflow += share; else act[a.id].outflow -= share;
    }
  }
  const sections = Object.entries(acts).map(([key, m]) => {
    const rows = Object.values(m).map((r) => ({ ...r, inflow: round2(r.inflow), outflow: round2(r.outflow), net: round2(r.inflow - r.outflow) })).sort((a, b) => a.code.localeCompare(b.code));
    return { key, rows, net: round2(rows.reduce((s, r) => s + r.net, 0)) };
  });
  // Jurnal saldo awal di dalam periode bukan arus kas: dianggap bagian dari saldo awal.
  const closeBal = await balancesByAccount({ to });
  const closing = round2(cashIds.reduce((s, id) => s + (closeBal[id] ? closeBal[id].debit - closeBal[id].credit : 0), 0));
  const net = round2(sections.reduce((s, x) => s + x.net, 0));
  return { from, to, sections, opening: round2(closing - net), closing, net };
}

// ─── Buku besar ──────────────────────────────────────────────────────────────
export async function generalLedger(f) {
  const { from, to } = parseRange(f, { defaultFrom: 'month' });
  if (!f.accountId) return { from, to, account: null, rows: [], opening: 0, closing: 0 };
  const account = await prisma.account.findUnique({ where: { id: idOf(f.accountId, 'Akun') } });
  ensure(account, 'Akun tidak ditemukan.', 404);
  const [before, lines] = await Promise.all([
    prisma.journalLine.aggregate({ where: { accountId: account.id, date: { lt: from } }, _sum: { debit: true, credit: true } }),
    prisma.journalLine.findMany({ where: { accountId: account.id, date: { gte: from, lte: to } }, orderBy: [{ date: 'asc' }, { journal: { number: 'asc' } }], include: { journal: { select: { id: true, number: true, description: true, reference: true, source: true } }, project: { select: { code: true } } } }),
  ]);
  const opening = round2(signed(account.normalBalance, before._sum.debit ?? 0, before._sum.credit ?? 0));
  let run = opening;
  const rows = lines.map((l) => {
    run = round2(run + signed(account.normalBalance, l.debit, l.credit));
    return { id: l.id, date: l.date, number: l.journal.number, journalId: l.journal.id, source: l.journal.source, reference: l.journal.reference, description: l.description ?? l.journal.description, project: l.project?.code ?? null, debit: Number(l.debit), credit: Number(l.credit), balance: run };
  });
  return { from, to, account, rows, opening, closing: run, totalDebit: round2(rows.reduce((s, r) => s + r.debit, 0)), totalCredit: round2(rows.reduce((s, r) => s + r.credit, 0)) };
}

// ─── Kas harian ──────────────────────────────────────────────────────────────
export async function dailyCash(f) {
  const { from, to } = parseRange({ from: f.from || f.to || iso(today()), to: f.to || f.from || iso(today()) });
  const where = { isCash: true, isGroup: false, ...(f.accountId ? { id: idOf(f.accountId, 'Akun') } : {}) };
  const accounts = await prisma.account.findMany({ where, orderBy: { code: 'asc' } });
  const out = [];
  for (const a of accounts) {
    const gl = await generalLedger({ accountId: a.id, from: iso(from), to: iso(to) });
    if (!gl.rows.length && !gl.opening) continue;
    out.push({ id: a.id, code: a.code, name: a.name, opening: gl.opening, closing: gl.closing, inflow: gl.totalDebit, outflow: gl.totalCredit, rows: gl.rows });
  }
  return { from, to, accounts: out, totals: { opening: round2(out.reduce((s, a) => s + a.opening, 0)), inflow: round2(out.reduce((s, a) => s + a.inflow, 0)), outflow: round2(out.reduce((s, a) => s + a.outflow, 0)), closing: round2(out.reduce((s, a) => s + a.closing, 0)) } };
}

// ─── Umur piutang / hutang ───────────────────────────────────────────────────
export async function aging(kind, f = {}) {
  const asOf = f.to ? date(f.to) : today();
  const docs = kind === 'ar'
    ? await prisma.invoice.findMany({ where: { status: { in: ['UNPAID', 'PARTIAL'] }, date: { lte: asOf } }, include: { client: { select: { id: true, name: true, code: true } } }, orderBy: { dueDate: 'asc' } })
    : await prisma.bill.findMany({ where: { status: { in: ['UNPAID', 'PARTIAL'] }, date: { lte: asOf } }, include: { vendor: { select: { id: true, name: true, code: true } } }, orderBy: { dueDate: 'asc' } });
  const empty = () => Object.fromEntries(AGING_BUCKETS.map(([k]) => [k, 0]));
  const parties = {};
  const totals = { ...empty(), total: 0 };
  const items = docs.map((d) => {
    const party = kind === 'ar' ? d.client : d.vendor;
    const outstanding = round2(Number(d.total) - Number(d.paid));
    const bucket = agingBucket(d.dueDate, asOf);
    const days = Math.max(0, Math.floor((asOf - new Date(d.dueDate)) / 86400000));
    const p = (parties[party.id] ??= { id: party.id, code: party.code, name: party.name, ...empty(), total: 0, count: 0 });
    p[bucket] = round2(p[bucket] + outstanding); p.total = round2(p.total + outstanding); p.count++;
    totals[bucket] = round2(totals[bucket] + outstanding); totals.total = round2(totals.total + outstanding);
    return { id: d.id, number: d.number, party: party.name, date: d.date, dueDate: d.dueDate, total: Number(d.total), outstanding, bucket, days };
  });
  return { asOf, kind, buckets: AGING_BUCKETS, parties: Object.values(parties).sort((a, b) => b.total - a.total), items, totals };
}

// ─── Profitabilitas proyek ───────────────────────────────────────────────────
export async function projectProfitability(f = {}) {
  const range = f.from || f.to ? parseRange(f) : {};
  const where = f.status ? { status: String(f.status) } : {};
  const projects = await prisma.project.findMany({ where, include: { client: { select: { name: true } } }, orderBy: { code: 'desc' } });
  const fin = await projectFinancials(projects.map((p) => p.id), range);
  const rows = projects.map((p) => {
    const x = fin[p.id];
    const cost = round2(x.directCost + x.overhead);
    return {
      id: p.id, code: p.code, name: p.name, client: p.client.name, serviceType: p.serviceType, status: p.status,
      contractValue: Number(p.contractValue), budgetCost: Number(p.budgetCost), ...x, cost,
      billedPct: Number(p.contractValue) ? round2((x.invoiced / Number(p.contractValue)) * 100) : 0,
      budgetUsedPct: Number(p.budgetCost) ? round2((cost / Number(p.budgetCost)) * 100) : 0,
    };
  });
  const sum = (k) => round2(rows.reduce((s, r) => s + r[k], 0));
  return { ...range, rows, totals: { contractValue: sum('contractValue'), invoiced: sum('invoiced'), collected: sum('collected'), revenue: sum('revenue'), cost: sum('cost'), margin: sum('margin') } };
}

export async function report(tab, f) {
  switch (tab) {
    case 'bs': return balanceSheet(f);
    case 'cf': return cashFlow(f);
    case 'tb': return trialBalance(f);
    case 'gl': return generalLedger(f);
    case 'daily': return dailyCash(f);
    case 'ar': return aging('ar', f);
    case 'ap': return aging('ap', f);
    case 'projects': return projectProfitability(f);
    default: return profitLoss(f);
  }
}

// ─── Export Excel ────────────────────────────────────────────────────────────
const d = (x) => (x ? iso(x) : '');
function sheetRows(tab, r) {
  switch (tab) {
    case 'pl': return Object.values(r.sections).flatMap((s) => [{ Akun: s.label.toUpperCase() }, ...s.rows.map((x) => ({ Kode: x.code, Akun: x.name, Jumlah: x.amount })), { Akun: 'Total ' + s.label, Jumlah: s.total }])
      .concat([{ Akun: 'Laba kotor', Jumlah: r.gross }, { Akun: 'Laba operasional', Jumlah: r.operating }, { Akun: 'Laba sebelum pajak', Jumlah: r.beforeTax }, { Akun: 'LABA BERSIH', Jumlah: r.net }]);
    case 'bs': return [r.assets, r.liabilities, r.equity].flatMap((s) => [{ Akun: s.label.toUpperCase() }, ...s.subs.flatMap((g) => [{ Akun: g.name }, ...g.rows.map((x) => ({ Kode: x.code, Akun: '   ' + x.name, Jumlah: x.amount })), { Akun: 'Jumlah ' + g.name, Jumlah: g.total }]), { Akun: 'TOTAL ' + s.label.toUpperCase(), Jumlah: s.total }]);
    case 'cf': return [{ Akun: 'Saldo kas awal', Bersih: r.opening }, ...r.sections.flatMap((s) => [{ Akun: LABELS['CF_' + s.key] ?? s.key }, ...s.rows.map((x) => ({ Kode: x.code, Akun: x.name, Masuk: x.inflow, Keluar: x.outflow, Bersih: x.net })), { Akun: 'Arus kas bersih', Bersih: s.net }]), { Akun: 'Saldo kas akhir', Bersih: r.closing }];
    case 'tb': return r.rows.map((x) => ({ Kode: x.code, Akun: x.name, Debit: x.debit, Kredit: x.credit })).concat([{ Akun: 'TOTAL', Debit: r.totalDebit, Kredit: r.totalCredit }]);
    case 'gl': return [{ Keterangan: 'Saldo awal', Saldo: r.opening }, ...r.rows.map((x) => ({ Tanggal: d(x.date), 'No. jurnal': x.number, Referensi: x.reference, Keterangan: x.description, Proyek: x.project, Debit: x.debit, Kredit: x.credit, Saldo: x.balance }))];
    case 'daily': return r.accounts.flatMap((a) => [{ Keterangan: `${a.code} ${a.name} — saldo awal`, Saldo: a.opening }, ...a.rows.map((x) => ({ Tanggal: d(x.date), 'No. jurnal': x.number, Keterangan: x.description, Masuk: x.debit, Keluar: x.credit, Saldo: x.balance })), { Keterangan: 'Saldo akhir', Saldo: a.closing }]);
    case 'ar': case 'ap': return r.items.map((x) => ({ Nomor: x.number, [tab === 'ar' ? 'Copart' : 'Vendor']: x.party, Tanggal: d(x.date), 'Jatuh tempo': d(x.dueDate), 'Hari lewat': x.days, Total: x.total, Sisa: x.outstanding, Umur: AGING_BUCKETS.find(([k]) => k === x.bucket)[1] }));
    case 'projects': return r.rows.map((x) => ({ Kode: x.code, Proyek: x.name, Copart: x.client, Status: x.status, 'Nilai kontrak': x.contractValue, Ditagih: x.invoiced, Diterima: x.collected, Pendapatan: x.revenue, 'Beban langsung': x.directCost, 'Beban lain': x.overhead, Margin: x.margin, 'Margin %': x.marginPct, Anggaran: x.budgetCost, 'Pemakaian anggaran %': x.budgetUsedPct }));
    default: return [];
  }
}

export async function exportReport(user, tab, f) {
  const r = await report(tab, f);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows(tab, r)), 'Laporan');
  await audit(null, user, { action: 'EXPORT', module: 'reports', note: `Export laporan ${tab}` });
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
