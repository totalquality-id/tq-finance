'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Download, Printer } from 'lucide-react';
import { Badge, FilterBar, SectionTabs } from '@/components/ui';
import { formatDate, iso } from '@/lib/dates';
import { tabLabel } from '@/lib/module-tabs';
import { acc, labelOf } from '@/lib/labels';

const long = { day: 'numeric', month: 'long', year: 'numeric' };
const fd = (d) => formatDate(d, long);
const pct = (v) => (v === null || v === undefined ? '-' : v + '%');
const inv = (number) => <Link href={`/invoices?q=${encodeURIComponent(number)}`}>{number}</Link>;

function Income({ d }) {
  return (
    <div className="stack">
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <table className="report">
          <thead><tr><th>Rekening</th><th className="num">Transaksi</th><th className="num">Diterima</th><th className="num">PPh 23</th></tr></thead>
          <tbody>
            {d.byAccount.map((r) => <tr key={r.key}><td>{labelOf(r.key)}</td><td className="num">{r.count}</td><td className="num">{acc(r.amount)}</td><td className="num">{acc(r.pph23)}</td></tr>)}
            <tr className="grand"><td>Total</td><td className="num">{d.totals.count}</td><td className="num">{acc(d.totals.amount)}</td><td className="num">{acc(d.totals.pph23)}</td></tr>
          </tbody>
        </table>
        <table className="report">
          <thead><tr><th>Copart</th><th className="num">Diterima</th></tr></thead>
          <tbody>{d.byCopart.slice(0, 10).map((r) => <tr key={r.key}><td>{r.key}</td><td className="num">{acc(r.amount)}</td></tr>)}</tbody>
        </table>
      </div>
      <table className="report">
        <thead><tr><th>Tanggal</th><th>Invoice</th><th>Copart</th><th>Keterangan</th><th>Rekening</th><th className="num">Diterima</th><th className="num">PPh 23</th></tr></thead>
        <tbody>
          {d.items.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 24 }}>Tidak ada pemasukan pada periode ini.</td></tr>}
          {d.items.map((r) => <tr key={r.id}><td className="nowrap">{formatDate(r.date)}</td><td className="nowrap">{inv(r.number)}</td><td>{r.copart}</td><td>{r.description}</td><td>{labelOf(r.account)}</td><td className="num">{acc(r.amount)}</td><td className="num">{acc(r.pph23)}</td></tr>)}
          <tr className="grand"><td colSpan={5}>Total pemasukan</td><td className="num">{acc(d.totals.amount)}</td><td className="num">{acc(d.totals.pph23)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function Recap({ d }) {
  return (
    <table className="report">
      <thead><tr><th>Bulan</th><th className="num">Invoice</th><th className="num">DPP</th><th className="num">PPN</th><th className="num">Total</th><th className="num">Seri TQ</th><th className="num">Operasional</th><th className="num">Akomodasi</th><th className="num">Diterima</th></tr></thead>
      <tbody>
        {d.months.map((m) => <tr key={m.month}><td>{m.label}</td><td className="num">{m.count || '-'}</td><td className="num">{acc(m.dpp)}</td><td className="num">{acc(m.ppn)}</td><td className="num">{acc(m.total)}</td><td className="num">{acc(m.TQ)}</td><td className="num">{acc(m.OPS)}</td><td className="num">{acc(m.AKOMODASI)}</td><td className="num">{acc(m.paid)}</td></tr>)}
        <tr className="grand"><td>Total {d.year}</td><td className="num">{d.totals.count}</td><td className="num">{acc(d.totals.dpp)}</td><td className="num">{acc(d.totals.ppn)}</td><td className="num">{acc(d.totals.total)}</td><td className="num">{acc(d.totals.TQ)}</td><td className="num">{acc(d.totals.OPS)}</td><td className="num">{acc(d.totals.AKOMODASI)}</td><td className="num">{acc(d.totals.paid)}</td></tr>
      </tbody>
    </table>
  );
}

function Aging({ d }) {
  return (
    <div className="stack">
      <table className="report">
        <thead><tr><th>Copart</th>{d.buckets.map(([k, l]) => <th key={k} className="num">{l}</th>)}<th className="num">Total</th></tr></thead>
        <tbody>
          {d.parties.map((p) => <tr key={p.id}><td>{p.name} <span className="muted">({p.count})</span></td>{d.buckets.map(([k]) => <td key={k} className={`num ${k !== 'current' && p[k] ? 'text-red' : ''}`}>{acc(p[k])}</td>)}<td className="num"><strong>{acc(p.total)}</strong></td></tr>)}
          <tr className="grand"><td>Total</td>{d.buckets.map(([k]) => <td key={k} className="num">{acc(d.totals[k])}</td>)}<td className="num">{acc(d.totals.total)}</td></tr>
        </tbody>
      </table>
      <table className="report">
        <thead><tr><th>Nomor</th><th>Copart</th><th>Tanggal</th><th>Jatuh tempo</th><th className="num">Hari lewat</th><th className="num">Sisa</th></tr></thead>
        <tbody>{d.items.map((i) => <tr key={i.id}><td>{inv(i.number)}</td><td>{i.party}</td><td>{formatDate(i.date)}</td><td>{formatDate(i.dueDate)}</td><td className={`num ${i.days ? 'text-red' : ''}`}>{i.days || '-'}</td><td className="num">{acc(i.outstanding)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function Contracts({ d }) {
  return (
    <div className="stack">
      <table className="report">
        <thead><tr><th>Departemen</th><th className="num">Kontrak</th><th className="num">Target {d.year}</th><th className="num">Tercapai</th><th className="num">%</th></tr></thead>
        <tbody>
          {d.depts.map((r) => <tr key={r.department}><td>{r.department}</td><td className="num">{r.count}</td><td className="num">{acc(r.target)}</td><td className="num">{acc(r.achieved)}</td><td className="num">{pct(r.pct)}</td></tr>)}
          <tr className="grand"><td>Total</td><td className="num">{d.contracts.length}</td><td className="num">{acc(d.totals.target)}</td><td className="num">{acc(d.totals.achieved)}</td><td className="num">{pct(d.totals.pct)}</td></tr>
        </tbody>
      </table>
      <table className="report">
        <thead><tr><th>Tgl kontrak</th><th>Copart</th><th>Program</th><th>Dept.</th><th>Presenter</th><th className="num">Nilai</th><th>Status</th></tr></thead>
        <tbody>{d.contracts.map((c) => <tr key={c.id}><td className="nowrap">{formatDate(c.contractDate)}</td><td>{c.copart}</td><td>{c.program ?? c.name}</td><td>{c.department ?? '-'}</td><td>{c.presenter ?? '-'}</td><td className="num">{acc(c.value)}</td><td><Badge value={c.status} /></td></tr>)}</tbody>
      </table>
    </div>
  );
}

export default function ReportsClient({ tab, data: d, company }) {
  const params = useSearchParams();
  const range = [{ name: 'from', label: 'Dari', type: 'date', default: iso(d.from) ?? '' }, { name: 'to', label: 'Sampai', type: 'date', default: iso(d.to) ?? '' }];
  const year = [{ name: 'year', label: 'Tahun', type: 'number', default: String(d.year ?? '') }];
  const filters = {
    income: range,
    invoices: year,
    aging: [{ name: 'to', label: 'Per tanggal', type: 'date', default: iso(d.asOf) ?? '' }, { name: 'series', label: 'Seri', type: 'select', options: [['TQ', 'Seri TQ'], ['OPS', 'Seri Operasional']] }],
    contracts: year,
  }[tab];
  const period = d.from ? `${fd(d.from)} s.d. ${fd(d.to)}` : d.asOf ? `Per ${fd(d.asOf)}` : `Tahun ${d.year}`;
  const exportHref = '/api/reports/export?' + new URLSearchParams({ ...Object.fromEntries(params), tab });

  return (
    <SectionTabs path="/reports" current={tab} keep={['from', 'to', 'year']}>
      <div className="stack">
        <FilterBar filters={filters}>
          <a className="btn btn-outline" href={exportHref}><Download size={16} /> Excel</a>
          <button className="btn btn-outline" onClick={() => window.print()}><Printer size={16} /> Cetak</button>
        </FilterBar>
        <div className="card" style={{ padding: 24 }}>
          <div className="report-head">
            <p>{company.name}</p>
            <h2>{tabLabel('/reports', tab).replace(/^./, (c) => c.toUpperCase())}</h2>
            <p>{period}</p>
          </div>
          <div className="report-wrap">
            {tab === 'income' && <Income d={d} />}
            {tab === 'invoices' && <Recap d={d} />}
            {tab === 'aging' && <Aging d={d} />}
            {tab === 'contracts' && <Contracts d={d} />}
          </div>
        </div>
      </div>
    </SectionTabs>
  );
}
