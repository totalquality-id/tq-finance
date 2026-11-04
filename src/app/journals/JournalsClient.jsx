'use client';

import { useState } from 'react';
import { Plus, Edit, Trash2, Lock } from 'lucide-react';
import { Badge, DataTable, FilterBar, Modal, Pager, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { AccountSelect, num, r2 } from '@/components/finance';
import { formatDate, iso, todayIso } from '@/lib/dates';
import { acc, idr, labelOf } from '@/lib/labels';

const SOURCES = ['MANUAL', 'OPENING', 'INVOICE', 'INVOICE_PAYMENT', 'BILL', 'BILL_PAYMENT', 'CASH', 'TAX_PAYMENT', 'DEPRECIATION'];
const line = () => ({ accountId: '', projectId: '', description: '', debit: '', credit: '' });

export default function JournalsClient({ data, page, accounts, projects, lock, canEdit }) {
  const { submit, busy } = useSubmit();
  const { showConfirm } = useDialog();
  const [form, setForm] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const detail = data.rows.find((r) => r.id === detailId);
  const locked = (d) => lock && iso(d) <= lock;

  const open = (j) => {
    if (!j) return setForm({ date: todayIso(), description: '', reference: '', source: 'MANUAL', lines: [line(), line()] });
    setForm({ id: j.id, number: j.number, date: iso(j.date), description: j.description, reference: j.reference ?? '', source: j.source, lines: j.lines.map((l) => ({ accountId: l.accountId, projectId: l.projectId ?? '', description: l.description ?? '', debit: l.debit || '', credit: l.credit || '' })) });
  };
  const setLine = (i, k, v) => setForm({ ...form, lines: form.lines.map((l, j) => (j === i ? { ...l, [k]: v, ...(k === 'debit' && v ? { credit: '' } : k === 'credit' && v ? { debit: '' } : {}) } : l)) });
  const td = form ? r2(form.lines.reduce((s, l) => s + num(l.debit), 0)) : 0;
  const tc = form ? r2(form.lines.reduce((s, l) => s + num(l.credit), 0)) : 0;
  const balanced = td > 0 && Math.abs(td - tc) < 0.005;

  const save = async (e) => {
    e.preventDefault();
    const { id, number: _n, ...body } = form;
    body.lines = body.lines.filter((l) => l.accountId && (num(l.debit) || num(l.credit))).map((l) => ({ ...l, debit: num(l.debit), credit: num(l.credit) }));
    if (await submit(id ? `/api/journals/${id}` : '/api/journals', { method: id ? 'PUT' : 'POST', body })) setForm(null);
  };
  const remove = async (j) => {
    if (await showConfirm(`Hapus jurnal ${j.number}?`, 'Hapus jurnal')) { await submit(`/api/journals/${j.id}`, { method: 'DELETE' }); setDetailId(null); }
  };

  return (
    <div className="stack">
      <FilterBar filters={[
        { type: 'search', label: 'Cari', placeholder: 'No. / keterangan / referensi' },
        { name: 'source', label: 'Sumber', type: 'select', options: SOURCES },
        { name: 'accountId', label: 'Akun', type: 'select', options: accounts.map((a) => [a.id, `${a.code} ${a.name}`]) },
        { name: 'from', label: 'Dari', type: 'date' },
        { name: 'to', label: 'Sampai', type: 'date' },
      ]}>
        {canEdit && <button className="btn btn-primary" onClick={() => open(null)}><Plus size={16} /> Jurnal baru</button>}
      </FilterBar>
      {lock && <div className="notice"><Lock size={14} style={{ verticalAlign: -2 }} /> Buku ditutup s.d. {formatDate(lock)}.</div>}

      <div className="card">
        <DataTable rows={data.rows} onRowClick={(r) => setDetailId(r.id)} empty="Belum ada jurnal."
          columns={[
            { key: 'number', label: 'No. jurnal', render: (j) => (<div><strong>{j.number}</strong><div className="muted">{formatDate(j.date)}</div></div>) },
            { key: 'desc', label: 'Keterangan', render: (j) => (<div>{j.description}<div className="muted">{j.lines.map((l) => l.account.code).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}</div></div>) },
            { key: 'ref', label: 'Referensi', render: (j) => j.reference ?? '-' },
            { key: 'src', label: 'Sumber', render: (j) => <Badge value={j.source} /> },
            { key: 'total', label: 'Total', num: true, render: (j) => idr(j.totalDebit) },
          ]} />
      </div>
      <Pager page={page} total={data.total} />

      <Modal open={Boolean(detail)} onClose={() => setDetailId(null)} title={detail ? `Jurnal ${detail.number}` : ''} subtitle={detail ? `${formatDate(detail.date)} · ${labelOf(detail.source)} · ${detail.creatorName}` : ''} size="modal-xl">
        {detail && (
          <div className="stack">
            <div><strong>{detail.description}</strong>{detail.reference && <span className="muted"> · Ref {detail.reference}</span>}</div>
            <div className="report-wrap">
              <table className="report">
                <thead><tr><th>Akun</th><th>Uraian</th><th>Proyek</th><th className="num">Debit</th><th className="num">Kredit</th></tr></thead>
                <tbody>
                  {detail.lines.map((l) => <tr key={l.id}><td>{l.account.code} {l.account.name}</td><td>{l.description ?? '-'}</td><td>{l.project?.code ?? '-'}</td><td className="num">{acc(l.debit)}</td><td className="num">{acc(l.credit)}</td></tr>)}
                  <tr className="total"><td colSpan={3}>Total</td><td className="num">{acc(detail.totalDebit)}</td><td className="num">{acc(detail.totalCredit)}</td></tr>
                </tbody>
              </table>
            </div>
            {!detail.editable && <div className="muted">Jurnal otomatis — ubah lewat dokumen sumbernya.</div>}
            {canEdit && detail.editable && !locked(detail.date) && (
              <div className="row-actions">
                <button className="btn btn-danger-outline btn-sm" onClick={() => remove(detail)}><Trash2 size={15} /> Hapus</button>
                <button className="btn btn-primary btn-sm" onClick={() => { const j = detail; setDetailId(null); open(j); }}><Edit size={15} /> Edit</button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? `Edit jurnal ${form.number}` : 'Jurnal baru'} size="modal-xl">
        {form && (
          <form onSubmit={save} className="stack">
            <div className="form-grid-3">
              <div className="form-group"><label className="form-label required">Tanggal</label><input className="form-input" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Jenis</label>
                <select className="form-select" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}><option value="MANUAL">Jurnal umum / penyesuaian</option><option value="OPENING">Saldo awal</option></select>
              </div>
              <div className="form-group"><label className="form-label">Referensi</label><input className="form-input" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="No. bukti / memo" /></div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="form-label required">Keterangan</label><input className="form-input" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="mis. Penyesuaian akrual gaji Oktober" /></div>
            </div>
            <div className="lines-wrap">
              <table className="lines">
                <thead><tr><th style={{ minWidth: 240 }}>Akun</th><th style={{ minWidth: 150 }}>Proyek</th><th>Uraian</th><th style={{ width: 150 }} className="num">Debit</th><th style={{ width: 150 }} className="num">Kredit</th><th style={{ width: 44 }} /></tr></thead>
                <tbody>
                  {form.lines.map((l, i) => (
                    <tr key={i}>
                      <td><AccountSelect accounts={accounts} value={l.accountId} onChange={(v) => setLine(i, 'accountId', v)} /></td>
                      <td><select className="form-select" value={l.projectId} onChange={(e) => setLine(i, 'projectId', e.target.value)}><option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</select></td>
                      <td><input className="form-input" value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} /></td>
                      <td className="num"><input className="form-input" type="number" min="0" step="any" value={l.debit} onChange={(e) => setLine(i, 'debit', e.target.value)} /></td>
                      <td className="num"><input className="form-input" type="number" min="0" step="any" value={l.credit} onChange={(e) => setLine(i, 'credit', e.target.value)} /></td>
                      <td>{form.lines.length > 2 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, lines: form.lines.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={3}>Total {balanced ? <span className="balance-ok">· seimbang</span> : <span className="balance-bad">· selisih {idr(td - tc)}</span>}</td><td className="num">{idr(td)}</td><td className="num">{idr(tc)}</td><td /></tr></tfoot>
              </table>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setForm({ ...form, lines: [...form.lines, line()] })}><Plus size={15} /> Tambah baris</button>
            </div>
            <div className="modal-footer" style={{ padding: 0 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Batal</button>
              <button className="btn btn-primary" disabled={busy || !balanced}>Simpan & posting</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
