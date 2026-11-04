'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, Printer } from 'lucide-react';
import { Badge, FilterBar, TabBar } from '@/components/ui';
import { formatDate, iso } from '@/lib/dates';
import { tabLabel, tabsFor } from '@/lib/module-tabs';
import { acc, idr, labelOf } from '@/lib/labels';

const long = { day: 'numeric', month: 'long', year: 'numeric' };
const fd = (d) => formatDate(d, long);

function Head({ company, title, period }) {
  return (
    <div className="report-head">
      <p>{company.name}</p>
      <h2>{title}</h2>
      <p>{period}</p>
    </div>
  );
}

// ─── Laba rugi ───────────────────────────────────────────────────────────────
function ProfitLoss({ d }) {
  const router = useRouter();
  const sec = (k) => d.sections[k];
  const block = (k, sign = 1) => {
    const s = sec(k);
    if (!s.rows.length) return null;
    return [
      <tr key={k} className="head"><td colSpan={2}>{s.label}</td><td /></tr>,
      ...s.rows.map((r) => (
        <tr key={r.id} className="l2 clickable" onClick={() => router.push(`/reports?tab=gl&accountId=${r.id}&from=${iso(d.from)}&to=${iso(d.to)}`)}>
          <td style={{ width: 90 }}>{r.code}</td><td>{r.name}</td><td className="num">{acc(r.amount * sign)}</td>
        </tr>
      )),
      <tr key={k + 't'} className="total"><td colSpan={2}>Jumlah {s.label.toLowerCase()}</td><td className="num">{acc(s.total * sign)}</td></tr>,
    ];
  };
  return (
    <table className="report">
      <tbody>
        {block('REVENUE')}
        {block('COST', -1)}
        <tr className="grand"><td colSpan={2}>Laba kotor</td><td className="num">{acc(d.gross)}</td></tr>
        {block('EXPENSE', -1)}
        <tr className="total"><td colSpan={2}>Laba operasional</td><td className="num">{acc(d.operating)}</td></tr>
        {block('OTHER_INCOME')}
        {block('OTHER_EXPENSE', -1)}
        <tr className="total"><td colSpan={2}>Laba sebelum pajak</td><td className="num">{acc(d.beforeTax)}</td></tr>
        {block('INCOME_TAX', -1)}
        <tr className="grand"><td colSpan={2}>Laba (rugi) bersih</td><td className="num">{acc(d.net)}</td></tr>
      </tbody>
    </table>
  );
}

// ─── Neraca ──────────────────────────────────────────────────────────────────
function BalanceSheet({ d }) {
  const sec = (s) => [
    <tr key={s.type} className="head"><td colSpan={2}>{s.label}</td><td /></tr>,
    ...s.subs.flatMap((g) => [
      <tr key={s.type + g.code + g.name} className="sub"><td colSpan={3}>{g.name}</td></tr>,
      ...g.rows.map((r) => <tr key={r.id} className="l2"><td style={{ width: 90 }}>{r.code}</td><td>{r.id.length > 4 ? <Link href={`/reports?tab=gl&accountId=${r.id}`}>{r.name}</Link> : r.name}</td><td className="num">{acc(r.amount)}</td></tr>),
      <tr key={s.type + g.code + 't'} className="total"><td colSpan={2}>Jumlah {g.name.toLowerCase()}</td><td className="num">{acc(g.total)}</td></tr>,
    ]),
  ];
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <table className="report"><tbody>{sec(d.assets)}<tr className="grand"><td colSpan={2}>Total aset</td><td className="num">{acc(d.assets.total)}</td></tr></tbody></table>
      <table className="report"><tbody>{sec(d.liabilities)}<tr className="total"><td colSpan={2}>Total kewajiban</td><td className="num">{acc(d.liabilities.total)}</td></tr>{sec(d.equity)}<tr className="total"><td colSpan={2}>Total ekuitas</td><td className="num">{acc(d.equity.total)}</td></tr><tr className="grand"><td colSpan={2}>Total kewajiban & ekuitas</td><td className="num">{acc(d.totalLE)}</td></tr></tbody></table>
      <div style={{ gridColumn: '1 / -1' }} className={d.balanced ? 'balance-ok' : 'balance-bad'}>{d.balanced ? '✓ Neraca seimbang' : `Neraca tidak seimbang — selisih ${idr(d.assets.total - d.totalLE)}`}</div>
    </div>
  );
}

// ─── Arus kas ────────────────────────────────────────────────────────────────
function CashFlow({ d }) {
  return (
    <table className="report">
      <thead><tr><th>Uraian</th><th className="num">Masuk</th><th className="num">Keluar</th><th className="num">Bersih</th></tr></thead>
      <tbody>
        <tr className="total"><td>Saldo kas & bank awal ({fd(d.from)})</td><td /><td /><td className="num">{acc(d.opening)}</td></tr>
        {d.sections.map((s) => [
          <tr key={s.key} className="head"><td colSpan={4}>{labelOf('CF_' + s.key)}</td></tr>,
          ...s.rows.map((r) => <tr key={s.key + r.code} className="l2"><td>{r.code} {r.name}</td><td className="num">{acc(r.inflow)}</td><td className="num">{acc(r.outflow)}</td><td className="num">{acc(r.net)}</td></tr>),
          <tr key={s.key + 't'} className="total"><td>Arus kas bersih {labelOf('CF_' + s.key).replace('Arus kas dari ', '')}</td><td /><td /><td className="num">{acc(s.net)}</td></tr>,
        ])}
        <tr className="total"><td>Kenaikan (penurunan) kas</td><td /><td /><td className="num">{acc(d.net)}</td></tr>
        <tr className="grand"><td>Saldo kas & bank akhir ({fd(d.to)})</td><td /><td /><td className="num">{acc(d.closing)}</td></tr>
      </tbody>
    </table>
  );
}

function TrialBalance({ d }) {
  return (
    <table className="report">
      <thead><tr><th style={{ width: 90 }}>Kode</th><th>Akun</th><th className="num">Debit</th><th className="num">Kredit</th></tr></thead>
      <tbody>
        {d.rows.map((r) => <tr key={r.id}><td>{r.code}</td><td><Link href={`/reports?tab=gl&accountId=${r.id}`}>{r.name}</Link></td><td className="num">{acc(r.debit)}</td><td className="num">{acc(r.credit)}</td></tr>)}
        <tr className="grand"><td colSpan={2}>Total {Math.abs(d.totalDebit - d.totalCredit) < 1 ? <span className="balance-ok">· seimbang</span> : <span className="balance-bad">· tidak seimbang</span>}</td><td className="num">{acc(d.totalDebit)}</td><td className="num">{acc(d.totalCredit)}</td></tr>
      </tbody>
    </table>
  );
}

function LedgerTable({ rows, opening, closing, inOut }) {
  return (
    <table className="report">
      <thead><tr><th>Tanggal</th><th>No. jurnal</th><th>Keterangan</th><th className="num">{inOut ? 'Masuk' : 'Debit'}</th><th className="num">{inOut ? 'Keluar' : 'Kredit'}</th><th className="num">Saldo</th></tr></thead>
      <tbody>
        <tr className="total"><td colSpan={5}>Saldo awal</td><td className="num">{acc(opening)}</td></tr>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="nowrap">{formatDate(r.date)}</td>
            <td className="nowrap"><Link href={`/journals?q=${r.number}`}>{r.number}</Link></td>
            <td>{r.description}{r.project && <span className="chip" style={{ marginLeft: 6 }}>{r.project}</span>}<div className="muted">{labelOf(r.source)}{r.reference ? ' · ' + r.reference : ''}</div></td>
            <td className="num">{acc(r.debit)}</td><td className="num">{acc(r.credit)}</td><td className="num">{acc(r.balance)}</td>
          </tr>
        ))}
        <tr className="grand"><td colSpan={5}>Saldo akhir</td><td className="num">{acc(closing)}</td></tr>
      </tbody>
    </table>
  );
}

function Aging({ d }) {
  return (
    <div className="stack">
      <table className="report">
        <thead><tr><th>{d.kind === 'ar' ? 'Klien' : 'Vendor'}</th>{d.buckets.map(([k, l]) => <th key={k} className="num">{l}</th>)}<th className="num">Total</th></tr></thead>
        <tbody>
          {d.parties.map((p) => <tr key={p.id}><td>{p.name} <span className="muted">({p.count})</span></td>{d.buckets.map(([k]) => <td key={k} className={`num ${k !== 'current' && p[k] ? 'text-red' : ''}`}>{acc(p[k])}</td>)}<td className="num"><strong>{acc(p.total)}</strong></td></tr>)}
          <tr className="grand"><td>Total</td>{d.buckets.map(([k]) => <td key={k} className="num">{acc(d.totals[k])}</td>)}<td className="num">{acc(d.totals.total)}</td></tr>
        </tbody>
      </table>
      <div className="section-title">Rincian dokumen</div>
      <table className="report">
        <thead><tr><th>Nomor</th><th>{d.kind === 'ar' ? 'Klien' : 'Vendor'}</th><th>Tanggal</th><th>Jatuh tempo</th><th className="num">Hari lewat</th><th className="num">Sisa</th></tr></thead>
        <tbody>
          {d.items.map((i) => <tr key={i.id}><td><Link href={`/${d.kind === 'ar' ? 'invoices' : 'bills'}?q=${i.number}`}>{i.number}</Link></td><td>{i.party}</td><td>{formatDate(i.date)}</td><td>{formatDate(i.dueDate)}</td><td className={`num ${i.days ? 'text-red' : ''}`}>{i.days || '-'}</td><td className="num">{acc(i.outstanding)}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

function Projects({ d }) {
  return (
    <table className="report">
      <thead><tr><th>Proyek</th><th className="num">Kontrak</th><th className="num">Ditagih</th><th className="num">Diterima</th><th className="num">Pendapatan</th><th className="num">Biaya</th><th className="num">Margin</th><th className="num">Anggaran terpakai</th></tr></thead>
      <tbody>
        {d.rows.map((r) => (
          <tr key={r.id}>
            <td><Link href={`/reports?tab=pl&projectId=${r.id}`}><strong>{r.code}</strong></Link> {r.name}<div className="muted">{r.client} · {labelOf(r.serviceType)} · <Badge value={r.status} /></div></td>
            <td className="num">{acc(r.contractValue)}</td>
            <td className="num">{acc(r.invoiced)}<div className="muted">{r.billedPct}%</div></td>
            <td className="num">{acc(r.collected)}</td>
            <td className="num">{acc(r.revenue)}</td>
            <td className="num">{acc(r.cost)}</td>
            <td className={`num ${r.margin < 0 ? 'text-red' : ''}`}>{acc(r.margin)}<div className="muted">{r.marginPct}%</div></td>
            <td className={`num ${r.budgetUsedPct > 100 ? 'text-red' : ''}`}>{r.budgetCost ? r.budgetUsedPct + '%' : '-'}</td>
          </tr>
        ))}
        <tr className="grand"><td>Total</td><td className="num">{acc(d.totals.contractValue)}</td><td className="num">{acc(d.totals.invoiced)}</td><td className="num">{acc(d.totals.collected)}</td><td className="num">{acc(d.totals.revenue)}</td><td className="num">{acc(d.totals.cost)}</td><td className="num">{acc(d.totals.margin)}</td><td /></tr>
      </tbody>
    </table>
  );
}

export default function ReportsClient({ tab, data: d, accounts, projects, company }) {
  const params = useSearchParams();
  const range = [{ name: 'from', label: 'Dari', type: 'date', default: iso(d.from) ?? '' }, { name: 'to', label: 'Sampai', type: 'date', default: iso(d.to) ?? '' }];
  const asOf = [{ name: 'to', label: 'Per tanggal', type: 'date', default: iso(d.to ?? d.asOf) ?? '' }];
  const filters = {
    pl: [...range, { name: 'projectId', label: 'Proyek', type: 'select', allLabel: 'Semua (perusahaan)', options: projects.map((p) => [p.id, `${p.code} — ${p.name}`]) }],
    bs: asOf, tb: asOf, ar: asOf, ap: asOf, cf: range,
    gl: [{ name: 'accountId', label: 'Akun', type: 'select', allLabel: '— Pilih akun —', options: accounts.map((a) => [a.id, `${a.code} — ${a.name}`]) }, ...range],
    daily: [{ name: 'accountId', label: 'Rekening', type: 'select', allLabel: 'Semua kas & bank', options: accounts.filter((a) => a.isCash).map((a) => [a.id, `${a.code} — ${a.name}`]) }, ...range],
    projects: [...range, { name: 'status', label: 'Status', type: 'select', options: ['AKTIF', 'DITAHAN', 'SELESAI', 'BATAL'] }],
  }[tab];
  const period = d.from ? `${fd(d.from)} s.d. ${fd(d.to)}` : `Per ${fd(d.to ?? d.asOf)}`;
  const project = tab === 'pl' && d.projectId ? projects.find((p) => p.id === d.projectId) : null;
  const title = tab === 'gl' && d.account ? `Buku Besar — ${d.account.code} ${d.account.name}` : project ? `Laba Rugi Proyek ${project.code} — ${project.name}` : tabLabel('/reports', tab).replace(/^./, (c) => c.toUpperCase());
  const exportHref = '/api/reports/export?' + new URLSearchParams({ ...Object.fromEntries(params), tab });

  return (
    <div className="stack">
      <TabBar path="/reports" items={tabsFor('/reports')} current={tab} />
      <FilterBar filters={filters}>
        <a className="btn btn-outline" href={exportHref}><Download size={16} /> Excel</a>
        <button className="btn btn-outline" onClick={() => window.print()}><Printer size={16} /> Cetak</button>
      </FilterBar>
      <div className="card" style={{ padding: 24 }}>
        <Head company={company} title={title} period={period} />
        <div className="report-wrap">
          {tab === 'pl' && <ProfitLoss d={d} />}
          {tab === 'bs' && <BalanceSheet d={d} />}
          {tab === 'cf' && <CashFlow d={d} />}
          {tab === 'tb' && <TrialBalance d={d} />}
          {tab === 'gl' && (d.account ? <LedgerTable rows={d.rows} opening={d.opening} closing={d.closing} /> : <div className="muted" style={{ textAlign: 'center', padding: 30 }}>Pilih akun untuk menampilkan buku besar.</div>)}
          {tab === 'daily' && (d.accounts.length ? d.accounts.map((a) => (
            <div key={a.id} style={{ marginBottom: 24 }}>
              <div className="section-title">{a.code} {a.name} — masuk {idr(a.inflow)} · keluar {idr(a.outflow)}</div>
              <LedgerTable rows={a.rows} opening={a.opening} closing={a.closing} inOut />
            </div>
          )) : <div className="muted" style={{ textAlign: 'center', padding: 30 }}>Tidak ada mutasi kas pada periode ini.</div>)}
          {(tab === 'ar' || tab === 'ap') && <Aging d={d} />}
          {tab === 'projects' && <Projects d={d} />}
        </div>
      </div>
    </div>
  );
}
