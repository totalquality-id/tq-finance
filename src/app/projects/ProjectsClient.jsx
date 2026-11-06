'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Edit, Trash2, FileText } from 'lucide-react';
import { Badge, Card, DataTable, FilterBar, FormFields, Modal, Pager, useSubmit } from '@/components/ui';
import PresenterInput from '@/components/PresenterInput';
import { num, r2 } from '@/components/finance';
import { DEPARTMENTS } from '@/lib/domain/billing';
import { PROGRAM_LIST, TERM_TEMPLATES, programGroup } from '@/lib/domain/programs';
import { formatDate, iso, todayIso } from '@/lib/dates';
import { idr, labelOf } from '@/lib/labels';

const STATUSES = ['MENUNGGU_DP', 'AKTIF', 'DITAHAN', 'SELESAI', 'BATAL'];
const EMPTY = { clientId: '', standard: '', department: 'CCD', presenters: [], fiscalYear: new Date().getFullYear(), contractNo: '', spkNo: '', contractDate: todayIso(), contractValue: '', startDate: todayIso(), endDate: '', manager: '', status: 'AKTIF', description: '' };
const addMonths = (isoDate, n) => { const d = new Date(isoDate + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const program = (p) => p.standard ?? p.name;

export default function ProjectsClient({ data, clients, presenters: presenterList, programs, page, canEdit }) {
  const { submit, busy } = useSubmit();
  const [form, setForm] = useState(null);
  const [ms, setMs] = useState([]);
  const [detailId, setDetailId] = useState(null);
  const [presenterOptions, setPresenterOptions] = useState(presenterList);
  const detail = data.rows.find((r) => r.id === detailId);
  const programOptions = [...new Set([...PROGRAM_LIST.map(([c]) => c), ...programs])].sort();

  const open = (p) => {
    if (!p) { setMs([]); return setForm({ ...EMPTY }); }
    setMs(p.milestones.map((m) => ({ id: m.id, name: m.name, percent: r2(Number(m.percent)), amount: Number(m.amount), dueDate: iso(m.dueDate) ?? '', notes: m.notes ?? '', invoiced: Boolean(m.invoiceId) })));
    setForm({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, p[k] ?? EMPTY[k]])), standard: program(p), id: p.id, code: p.code, contractDate: iso(p.contractDate) ?? '', startDate: iso(p.startDate), endDate: iso(p.endDate) ?? '' });
  };
  const value = num(form?.contractValue);
  const setPercent = (i, pct) => setMs(ms.map((m, j) => (j === i ? { ...m, percent: pct, amount: Math.round((value * num(pct)) / 100) } : m)));
  const applyTemplate = (idx) => {
    const [, terms] = TERM_TEMPLATES[idx];
    let used = 0;
    setMs(terms.map(([name, pct], i) => {
      const amount = i === terms.length - 1 ? value - used : Math.round((value * pct) / 100);
      used += amount;
      return { name, percent: r2(pct), amount, dueDate: addMonths(form.startDate || todayIso(), i), notes: '' };
    }));
  };
  const msTotal = r2(ms.reduce((s, m) => s + num(m.amount), 0));
  const setM = (i, k, v) => setMs(ms.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const save = async (e) => {
    e.preventDefault();
    const { id, code: _c, ...body } = form;
    body.name = body.standard;
    body.serviceType = programGroup(body.standard);
    body.milestones = ms.map((m) => ({ id: m.id, name: m.name, percent: num(m.percent), amount: num(m.amount), dueDate: m.dueDate, notes: m.notes }));
    if (await submit(id ? `/api/projects/${id}` : '/api/projects', { method: id ? 'PUT' : 'POST', body })) setForm(null);
  };

  return (
    <div className="stack">
      <FilterBar filters={[
        { type: 'search', label: 'Cari', placeholder: 'Copart / program / presenter / no. kontrak' },
        { name: 'status', label: 'Status', type: 'select', options: STATUSES },
        { name: 'department', label: 'Departemen', type: 'select', options: DEPARTMENTS },
        { name: 'year', label: 'Tahun omzet', type: 'number' },
        { name: 'clientId', label: 'Copart', type: 'select', options: clients.map((c) => [c.id, c.name]) },
      ]}>
        {canEdit && <button className="btn btn-primary" onClick={() => open(null)}><Plus size={16} /> Kontrak baru</button>}
      </FilterBar>

      <div className="card">
        <DataTable rows={data.rows} onRowClick={(r) => setDetailId(r.id)} empty="Belum ada kontrak."
          columns={[
            { key: 'copart', label: 'Copart', render: (p) => <strong>{p.client.name}</strong> },
            { key: 'program', label: 'Program', render: (p) => program(p) },
            { key: 'sign', label: 'Tgl kontrak', render: (p) => formatDate(p.contractDate) },
            { key: 'dept', label: 'Dept.', render: (p) => (p.department ? labelOf(p.department) : '-') },
            { key: 'pres', label: 'Presenter', render: (p) => (p.presenters.length ? <span className="chips">{p.presenters.map((c) => <span key={c} className="tag">{c}</span>)}</span> : '-') },
            { key: 'val', label: 'Nilai kontrak', num: true, render: (p) => idr(p.contractValue) },
            { key: 'col', label: 'Diterima', num: true, render: (p) => idr(p.fin.collected) },
            { key: 'status', label: 'Status', render: (p) => <Badge value={p.status} /> },
          ]} />
      </div>
      <Pager page={page} total={data.total} />

      <Modal open={Boolean(detail)} onClose={() => setDetailId(null)} title={detail ? detail.client.name : ''} subtitle={detail ? program(detail) : ''} size="modal-xl">
        {detail && (
          <div className="stack">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Badge value={detail.status} />{detail.department && <span className="chip">{labelOf(detail.department)}</span>}{detail.fiscalYear && <span className="chip">Omzet {detail.fiscalYear}</span>}<span className="chip">{detail.code}</span></div>
            <div className="kpi-grid">
              <div className="kpi-card"><div className="kpi-label">Nilai kontrak</div><div className="kpi-value">{idr(detail.contractValue)}</div></div>
              <div className="kpi-card"><div className="kpi-label">Ditagih</div><div className="kpi-value">{idr(detail.fin.billed)}</div></div>
              <div className="kpi-card"><div className="kpi-label">Diterima</div><div className="kpi-value">{idr(detail.fin.collected)}</div></div>
              <div className="kpi-card"><div className="kpi-label">Outstanding</div><div className="kpi-value">{idr(detail.fin.outstanding)}</div></div>
            </div>
            <dl className="detail-grid">
              <div><dt>Presenter</dt><dd>{detail.presenters.join(', ') || '-'}</dd></div>
              <div><dt>No. kontrak / SPK</dt><dd>{[detail.contractNo, detail.spkNo].filter(Boolean).join(' · ') || '-'}</dd></div>
              <div><dt>Tanggal kontrak</dt><dd>{formatDate(detail.contractDate)}</dd></div>
              <div><dt>Pelaksana</dt><dd>{detail.manager ?? '-'}</dd></div>
              <div style={{ gridColumn: '1 / -1' }}><dt>Keterangan</dt><dd className="pre">{detail.description ?? '-'}</dd></div>
            </dl>
            <Card title="Termin" padding={0}>
              <DataTable rows={detail.milestones} empty="Belum ada termin." columns={[
                { key: 'seq', label: '#', render: (m) => m.sequence },
                { key: 'name', label: 'Termin' },
                { key: 'due', label: 'Bulan tagih', render: (m) => formatDate(m.dueDate, { month: 'long', year: 'numeric' }) },
                { key: 'amount', label: 'Nominal', num: true, render: (m) => idr(m.amount) },
                { key: 'notes', label: 'Keterangan', render: (m) => m.notes ?? '' },
                { key: 'inv', label: 'Invoice', render: (m) => (m.invoice ? <Link href={`/invoices?q=${encodeURIComponent(m.invoice.number)}`}>{m.invoice.number}</Link>
                  : canEdit && ['AKTIF', 'MENUNGGU_DP'].includes(detail.status) ? <Link className="btn btn-outline btn-sm" href={`/invoices?new=1&projectId=${detail.id}&milestoneId=${m.id}`}><FileText size={14} /> Buat invoice</Link> : '-') },
                { key: 'st', label: 'Status', render: (m) => <Badge value={m.invoice?.status ?? 'PLANNED'} /> },
              ]} />
            </Card>
            {canEdit && <div className="row-actions"><button className="btn btn-primary btn-sm" onClick={() => { const r = detail; setDetailId(null); open(r); }}><Edit size={15} /> Edit kontrak</button></div>}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? `Edit ${form.code}` : 'Kontrak baru'} size="modal-xl">
        {form && (
          <form onSubmit={save} className="stack">
            <datalist id="program-list">{programOptions.map((p) => <option key={p} value={p} />)}</datalist>
            <div className="form-grid-3">
              <div className="form-group"><label className="form-label required">Copart</label>
                <select className="form-select" required value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}><option value="">— Pilih —</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              </div>
              <div className="form-group"><label className="form-label required">Program</label><input className="form-input" list="program-list" required value={form.standard} onChange={(e) => setForm({ ...form, standard: e.target.value.toUpperCase() })} placeholder="QMS, EMP, AUDIT…" /></div>
              <div className="form-group"><label className="form-label">Presenter</label><PresenterInput value={form.presenters} onChange={(v) => setForm({ ...form, presenters: v })} options={presenterOptions} onOptionsChange={setPresenterOptions} /></div>
            </div>
            <FormFields values={form} setValues={setForm} columns={3} fields={[
              { name: 'contractDate', label: 'Tanggal kontrak (sign)', type: 'date', required: true },
              { name: 'contractValue', label: 'Nilai kontrak / omzet (Rp)', type: 'number', min: 0, step: 'any', required: true },
              { name: 'department', label: 'Departemen', type: 'select', options: DEPARTMENTS },
              { name: 'fiscalYear', label: 'Tahun omzet', type: 'number', min: 2000, max: 2100 },
              { name: 'status', label: 'Status', type: 'select', options: STATUSES, noEmpty: true },
              { name: 'manager', label: 'Pelaksana' },
              { name: 'contractNo', label: 'No. kontrak' },
              { name: 'spkNo', label: 'No. SPK / PO' },
              { name: 'startDate', label: 'Start implementasi', type: 'date', required: true },
              { name: 'description', label: 'Keterangan', type: 'textarea', span: true, rows: 2, placeholder: 'mis. JHN 3%, No bonus, catatan keuangan' },
            ]} />
            <div>
              <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>Termin pembayaran</span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {TERM_TEMPLATES.map(([label], i) => <button key={label} type="button" className="btn btn-ghost btn-sm" disabled={!value} onClick={() => applyTemplate(i)}>{label}</button>)}
                </span>
              </div>
              <div className="lines-wrap">
                <table className="lines">
                  <thead><tr><th>Termin</th><th style={{ width: 80 }}>%</th><th style={{ width: 160 }} className="num">Nominal</th><th style={{ width: 160 }}>Jatuh tempo</th><th>Keterangan</th><th style={{ width: 44 }} /></tr></thead>
                  <tbody>
                    {ms.map((m, i) => (
                      <tr key={i}>
                        <td><input className="form-input" required value={m.name} onChange={(e) => setM(i, 'name', e.target.value)} /></td>
                        <td><input className="form-input" type="number" min="0" max="100" step="any" value={m.percent} disabled={m.invoiced} onChange={(e) => setPercent(i, e.target.value)} /></td>
                        <td className="num"><input className="form-input" type="number" min="0" step="any" value={m.amount} disabled={m.invoiced} onChange={(e) => setMs(ms.map((x, j) => (j === i ? { ...x, amount: e.target.value, percent: value ? r2((num(e.target.value) / value) * 100) : 0 } : x)))} /></td>
                        <td><input className="form-input" type="date" value={m.dueDate} onChange={(e) => setM(i, 'dueDate', e.target.value)} /></td>
                        <td><input className="form-input" value={m.notes} onChange={(e) => setM(i, 'notes', e.target.value)} /></td>
                        <td>{!m.invoiced && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMs(ms.filter((_, j) => j !== i))}><Trash2 size={15} /></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                  {ms.length > 0 && <tfoot><tr><td>Total</td><td>{r2((msTotal / (value || 1)) * 100)}%</td><td className={`num ${msTotal > value + 0.5 ? 'text-red' : ''}`}>{idr(msTotal)}</td><td colSpan={3} /></tr></tfoot>}
                </table>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setMs([...ms, { name: `Termin ${ms.length + 1}`, percent: 0, amount: 0, dueDate: '', notes: '' }])}><Plus size={15} /> Tambah termin</button>
              </div>
            </div>
            <div className="modal-footer" style={{ padding: 0 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Batal</button>
              <button className="btn btn-primary" disabled={busy}>Simpan</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
