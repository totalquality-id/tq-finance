'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Download, FileText, Trash2 } from 'lucide-react';
import { Kpi, Modal, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { formatDate, iso } from '@/lib/dates';
import { acc, idr, labelOf } from '@/lib/labels';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const STATE_LABEL = { PAID: 'Lunas', INVOICED: 'Sudah diinvoice', OVERDUE: 'Lewat jatuh tempo', LATE: 'Belum ditagih, lewat rencana', PLANNED: 'Rencana tagih' };

function EntryModal({ entry, row, canEdit, onClose }) {
  const { submit, busy } = useSubmit();
  const { showConfirm } = useDialog();
  const due = iso(entry.dueDate) ?? '';
  const [form, setForm] = useState({ name: entry.label, amount: entry.termAmount ?? entry.amount, month: due.slice(0, 7), day: due.slice(8, 10) || '01', notes: entry.notes ?? '' });
  const editable = canEdit && entry.kind === 'TERMIN' && !entry.invoiceId;

  const save = async (e) => {
    e.preventDefault();
    // Hari dipertahankan; disesuaikan bila bulan tujuan lebih pendek (mis. 31 → 30).
    const [y, m] = form.month.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const dueDate = `${form.month}-${String(Math.min(Number(form.day), last)).padStart(2, '0')}`;
    if (await submit(`/api/projects/milestones/${entry.id}`, { method: 'PUT', body: { name: form.name, amount: Number(form.amount), dueDate, notes: form.notes } })) onClose();
  };
  const remove = async () => {
    if (await showConfirm(`Hapus termin "${entry.label}" (${idr(entry.amount)}) dari kontrak ${row.copart}?`, 'Hapus termin')) {
      if (await submit(`/api/projects/milestones/${entry.id}`, { method: 'DELETE' })) onClose();
    }
  };

  return (
    <Modal open onClose={onClose} title={row.copart} subtitle={row.name}>
      <div className="stack">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={`cell-entry st-${entry.state}`} style={{ display: 'inline-block' }}>{STATE_LABEL[entry.state]}</span>
          {entry.number && <span className="chip">{entry.number}</span>}
        </div>
        {editable ? (
          <form onSubmit={save} className="stack" style={{ gap: 12 }}>
            <div className="form-group"><label className="form-label required">Nama termin</label><input className="form-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label required">Bulan penagihan</label><input className="form-input" type="month" required value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} /></div>
              <div className="form-group"><label className="form-label required">Nominal</label><input className="form-input" type="number" min="0" step="any" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            </div>
            <div className="form-group"><label className="form-label">Keterangan</label><input className="form-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="modal-footer" style={{ padding: 0, justifyContent: 'space-between' }}>
              <button type="button" className="btn btn-danger-outline btn-sm" disabled={busy} onClick={remove}><Trash2 size={15} /> Hapus</button>
              <span className="row-actions">
                <Link className="btn btn-outline btn-sm" href={`/invoices?new=1&projectId=${entry.projectId}&milestoneId=${entry.id}`}><FileText size={15} /> Buat invoice</Link>
                <button className="btn btn-primary btn-sm" disabled={busy}>Simpan</button>
              </span>
            </div>
          </form>
        ) : (
          <>
            <dl className="detail-grid">
              <div><dt>{entry.invoiceId ? 'Invoice' : 'Termin'}</dt><dd>{entry.label}</dd></div>
              <div><dt>{entry.invoiceId ? 'Jatuh tempo' : 'Rencana tagih'}</dt><dd>{formatDate(entry.dueDate)}</dd></div>
              <div><dt>Nominal</dt><dd>{idr(entry.amount)}</dd></div>
              <div><dt>Diterima</dt><dd>{idr(entry.paid)}</dd></div>
              {entry.notes && <div style={{ gridColumn: '1 / -1' }}><dt>Keterangan</dt><dd>{entry.notes}</dd></div>}
            </dl>
            {entry.invoiceId && canEdit && <p className="muted">Sudah diinvoice — ubah atau batalkan lewat invoicenya.</p>}
            {entry.invoiceId && <div className="row-actions"><Link className="btn btn-primary btn-sm" href={`/invoices?q=${encodeURIComponent(entry.number)}`}>Buka invoice</Link></div>}
          </>
        )}
      </div>
    </Modal>
  );
}

export default function BillingClient({ data, canEdit }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(null);
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
                <td className="first" title={r.note ?? ''}>
                  <strong>{r.copart}</strong>
                  <div className="muted">{r.code ? <Link href={`/projects?q=${encodeURIComponent(r.copart)}`}>{r.name}</Link> : r.name}{r.status && r.status !== 'AKTIF' ? ` · ${labelOf(r.status)}` : ''}</div>
                </td>
                {r.months.map((entries, i) => (
                  <td key={i} className="num">
                    {entries.map((e) => (
                      <button key={e.id} type="button" className={`cell-entry st-${e.state}`} title={`${e.label} · ${STATE_LABEL[e.state]}${e.number ? ' · ' + e.number : ''}`} onClick={() => setOpen({ entry: e, row: r })}>
                        {acc(e.amount)}
                      </button>
                    ))}
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

      {open && <EntryModal key={open.entry.id} entry={open.entry} row={open.row} canEdit={canEdit} onClose={() => setOpen(null)} />}
    </div>
  );
}
