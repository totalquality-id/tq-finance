'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Download } from 'lucide-react';
import { Kpi } from '@/components/ui';
import { acc, idr, labelOf } from '@/lib/labels';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const STATE_LABEL = { PAID: 'Lunas', INVOICED: 'Sudah diinvoice', OVERDUE: 'Lewat jatuh tempo', LATE: 'Belum ditagih, lewat rencana', PLANNED: 'Rencana tagih' };

export default function BillingClient({ data }) {
  const router = useRouter();
  const pathname = usePathname();
  const pct = (v) => (v === null ? '-' : v + '%');

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="form-group">
          <label className="form-label">Tahun</label>
          <input className="form-input" type="number" style={{ width: 120 }} defaultValue={data.year} onChange={(e) => e.target.value.length === 4 && router.push(`${pathname}?year=${e.target.value}`)} />
        </div>
        <div className="spacer" />
        <a className="btn btn-outline" href={`/api/reports/export?tab=billing&year=${data.year}`}><Download size={16} /> Excel</a>
      </div>

      <div className="kpi-grid">
        <Kpi label={`Target penagihan ${data.year}`} value={idr(data.totals.target)} />
        <Kpi label="Tertagih" value={idr(data.totals.collected)} />
        <Kpi label="Outstanding" value={idr(data.totals.outstanding)} />
        <Kpi label="% penagihan" value={pct(data.totals.pct)} />
      </div>

      <div className="legend">{Object.entries(STATE_LABEL).map(([k, l]) => <span key={k} className={`l-${k}`}>{l}</span>)}</div>

      <div className="card report-wrap" style={{ maxHeight: '70vh', overflow: 'auto' }}>
        <table className="monitor">
          <thead>
            <tr><th className="first">Copart / kontrak</th>{MONTHS.map((m) => <th key={m} className="num">{m}</th>)}<th className="num">Total</th></tr>
          </thead>
          <tbody>
            {data.rows.length === 0 && <tr><td colSpan={14} className="muted" style={{ padding: 24, textAlign: 'center' }}>Belum ada termin atau invoice kontrak pada tahun ini.</td></tr>}
            {data.rows.map((r) => (
              <tr key={r.id}>
                <td className="first">
                  <strong>{r.copart}</strong>
                  <div className="muted">{r.code ? <Link href={`/projects?q=${encodeURIComponent(r.code)}`}>{r.name}</Link> : r.name}{r.status && r.status !== 'AKTIF' ? ` · ${labelOf(r.status)}` : ''}</div>
                  {r.note && <div className="muted" style={{ fontSize: 12 }}>{r.note}</div>}
                </td>
                {r.months.map((entries, i) => (
                  <td key={i} className="num">
                    {entries.map((e) => {
                      const body = <span title={`${e.label} · ${STATE_LABEL[e.state]}${e.number ? ' · ' + e.number : ''}`}>{acc(e.amount)}</span>;
                      return e.invoiceId
                        ? <Link key={e.id} href={`/invoices?q=${encodeURIComponent(e.number)}`} className={`cell-entry st-${e.state}`}>{body}</Link>
                        : <span key={e.id} className={`cell-entry st-${e.state}`}>{body}</span>;
                    })}
                  </td>
                ))}
                <td className="num"><strong>{acc(r.total)}</strong></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td className="first">Target penagihan</td>{data.months.map((m) => <td key={m.label} className="num">{acc(m.target)}</td>)}<td className="num">{acc(data.totals.target)}</td></tr>
            <tr><td className="first">Tertagih</td>{data.months.map((m) => <td key={m.label} className="num">{acc(m.collected)}</td>)}<td className="num">{acc(data.totals.collected)}</td></tr>
            <tr><td className="first">Outstanding</td>{data.months.map((m) => <td key={m.label} className="num">{acc(m.outstanding)}</td>)}<td className="num">{acc(data.totals.outstanding)}</td></tr>
            <tr><td className="first">% penagihan</td>{data.months.map((m) => <td key={m.label} className="num">{pct(m.pct)}</td>)}<td className="num">{pct(data.totals.pct)}</td></tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
