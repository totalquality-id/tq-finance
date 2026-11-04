'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Edit, Trash2, FileText } from 'lucide-react';
import { Badge, Card, DataTable, FilterBar, FormFields, Modal, Pager, useSubmit } from '@/components/ui';
import { num, r2 } from '@/components/finance';
import { formatDate, iso, todayIso } from '@/lib/dates';
import { acc, idr, labelOf } from '@/lib/labels';

const SERVICES = ['KONSULTANSI', 'AUDIT', 'PELATIHAN', 'SERTIFIKASI', 'ELEARNING', 'LAINNYA'];
const STATUSES = ['AKTIF', 'DITAHAN', 'SELESAI', 'BATAL'];
const EMPTY = { name: '', clientId: '', serviceType: 'KONSULTANSI', standard: '', contractNo: '', contractDate: '', contractValue: '', budgetCost: '', startDate: todayIso(), endDate: '', manager: '', status: 'AKTIF', description: '' };
const TEMPLATE = [['DP / Uang muka', 30], ['Progres implementasi', 40], ['Pelunasan setelah sertifikasi', 30]];

function Progress({ pct }) {
  const cls = pct > 100 ? 'over' : pct > 85 ? 'warn' : '';
  return <div className={`progress ${cls}`} title={`${pct}%`}><span style={{ width: Math.min(100, pct) + '%' }} /></div>;
}

export default function ProjectsClient({ data, clients, page, canEdit }) {
  const { submit, busy } = useSubmit();
  const [form, setForm] = useState(null);
  const [ms, setMs] = useState([]);
  const [detailId, setDetailId] = useState(null);
  const detail = data.rows.find((r) => r.id === detailId);

  const open = (p) => {
    if (!p) { setMs([]); return setForm({ ...EMPTY }); }
    setMs(p.milestones.map((m) => ({ id: m.id, name: m.name, percent: Number(m.percent), amount: Number(m.amount), dueDate: iso(m.dueDate) ?? '', invoiced: Boolean(m.invoiceId) })));
    setForm({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, p[k] ?? ''])), id: p.id, code: p.code, contractDate: iso(p.contractDate) ?? '', startDate: iso(p.startDate), endDate: iso(p.endDate) ?? '' });
  };
  const value = num(form?.contractValue);
  const setPercent = (i, pct) => setMs(ms.map((m, j) => (j === i ? { ...m, percent: pct, amount: r2((value * num(pct)) / 100) } : m)));
  const applyTemplate = () => setMs(TEMPLATE.map(([name, pct]) => ({ name, percent: pct, amount: r2((value * pct) / 100), dueDate: '' })));
  const msTotal = r2(ms.reduce((s, m) => s + num(m.amount), 0));

  const save = async (e) => {
    e.preventDefault();
    const { id, code: _c, ...body } = form;
    body.milestones = ms.map((m) => ({ id: m.id, name: m.name, percent: num(m.percent), amount: num(m.amount), dueDate: m.dueDate }));
    if (await submit(id ? `/api/projects/${id}` : '/api/projects', { method: id ? 'PUT' : 'POST', body })) setForm(null);
  };

  return (
    <div className="stack">
      <FilterBar filters={[
        { type: 'search', label: 'Cari', placeholder: 'Kode / nama / Copart / no. kontrak' },
        { name: 'status', label: 'Status', type: 'select', options: STATUSES },
        { name: 'serviceType', label: 'Jenis jasa', type: 'select', options: SERVICES },
        { name: 'clientId', label: 'Copart', type: 'select', options: clients.map((c) => [c.id, c.name]) },
      ]}>
        {canEdit && <button className="btn btn-primary" onClick={() => open(null)}><Plus size={16} /> Proyek baru</button>}
      </FilterBar>

      <div className="card">
        <DataTable rows={data.rows} onRowClick={(r) => setDetailId(r.id)} empty="Belum ada proyek."
          columns={[
            { key: 'name', label: 'Proyek', render: (p) => (<div><strong>{p.name}</strong><div className="muted">{p.code} · {p.client.name}</div></div>) },
            { key: 'svc', label: 'Jasa', render: (p) => (<div>{labelOf(p.serviceType)}<div className="muted">{p.standard ?? ''}</div></div>) },
            { key: 'val', label: 'Nilai kontrak', num: true, render: (p) => idr(p.contractValue) },
            { key: 'inv', label: 'Ditagih', num: true, render: (p) => (<div>{idr(p.fin.invoiced)}<div className="muted">{p.contractValue ? Math.round((p.fin.invoiced / p.contractValue) * 100) : 0}%</div></div>) },
            { key: 'cost', label: 'Biaya', num: true, render: (p) => (<div>{idr(p.fin.directCost + p.fin.overhead)}{p.budgetCost > 0 && <Progress pct={Math.round(((p.fin.directCost + p.fin.overhead) / p.budgetCost) * 100)} />}</div>) },
            { key: 'margin', label: 'Margin', num: true, render: (p) => <span className={p.fin.margin < 0 ? 'text-red' : ''}>{acc(p.fin.margin)}</span> },
            { key: 'status', label: 'Status', render: (p) => <Badge value={p.status} /> },
          ]} />
      </div>
      <Pager page={page} total={data.total} />

      <Modal open={Boolean(detail)} onClose={() => setDetailId(null)} title={detail ? `${detail.code} — ${detail.name}` : ''} subtitle={detail?.client.name} size="modal-xl">
        {detail && (
          <div className="stack">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Badge value={detail.status} /><span className="chip">{labelOf(detail.serviceType)}</span>{detail.standard && <span className="chip">{detail.standard}</span>}</div>
            <div className="kpi-grid">
              <div className="kpi-card"><div className="kpi-label">Nilai kontrak</div><div className="kpi-value">{idr(detail.contractValue)}</div></div>
              <div className="kpi-card"><div className="kpi-label">Ditagih / diterima</div><div className="kpi-value">{idr(detail.fin.invoiced)}</div><div className="kpi-trend flat">Diterima {idr(detail.fin.collected)}</div></div>
              <div className="kpi-card"><div className="kpi-label">Pendapatan − biaya</div><div className="kpi-value">{acc(detail.fin.margin)}</div><div className="kpi-trend flat">Margin {detail.fin.marginPct}%</div></div>
              <div className="kpi-card"><div className="kpi-label">Biaya vs anggaran</div><div className="kpi-value">{idr(detail.fin.directCost + detail.fin.overhead)}</div><div className="kpi-trend flat">Anggaran {idr(detail.budgetCost)}</div></div>
            </div>
            <dl className="detail-grid">
              <div><dt>No. kontrak / SPK</dt><dd>{detail.contractNo ?? '-'}{detail.contractDate ? ` · ${formatDate(detail.contractDate)}` : ''}</dd></div>
              <div><dt>Periode</dt><dd>{formatDate(detail.startDate)} – {formatDate(detail.endDate)}</dd></div>
              <div><dt>Penanggung jawab</dt><dd>{detail.manager ?? '-'}</dd></div>
              <div><dt>Keterangan</dt><dd>{detail.description ?? '-'}</dd></div>
            </dl>
            <Card title="Termin penagihan" padding={0}>
              <DataTable rows={detail.milestones} empty="Belum ada termin. Edit proyek untuk menambah termin."
                columns={[
                  { key: 'seq', label: '#', render: (m) => m.sequence },
                  { key: 'name', label: 'Termin' },
                  { key: 'pct', label: '%', num: true, render: (m) => Number(m.percent) },
                  { key: 'amount', label: 'Nilai', num: true, render: (m) => idr(m.amount) },
                  { key: 'due', label: 'Rencana tagih', render: (m) => formatDate(m.dueDate) },
                  { key: 'inv', label: 'Invoice', render: (m) => (m.invoice ? <Link href={`/invoices?q=${m.invoice.number}`}>{m.invoice.number} <Badge value={m.invoice.status} /></Link>
                    : canEdit && detail.status === 'AKTIF' ? <Link className="btn btn-outline btn-sm" href={`/invoices?new=1&projectId=${detail.id}&milestoneId=${m.id}`}><FileText size={14} /> Buat invoice</Link> : '-') },
                ]} />
            </Card>
            <div className="row-actions">
              <Link className="btn btn-ghost btn-sm" href={`/reports?tab=pl&projectId=${detail.id}`}>Laba rugi proyek</Link>
              <Link className="btn btn-ghost btn-sm" href={`/invoices?projectId=${detail.id}`}>Invoice proyek</Link>
              <Link className="btn btn-ghost btn-sm" href={`/bills?projectId=${detail.id}`}>Biaya vendor</Link>
              {canEdit && <button className="btn btn-primary btn-sm" onClick={() => { const r = detail; setDetailId(null); open(r); }}><Edit size={15} /> Edit proyek</button>}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? `Edit ${form.code}` : 'Proyek baru'} size="modal-xl">
        {form && (
          <form onSubmit={save} className="stack">
            <FormFields values={form} setValues={setForm} columns={3} fields={[
              { name: 'name', label: 'Nama proyek', required: true, span: true, placeholder: 'mis. Pendampingan Sertifikasi ISO 9001:2015 PT ABC' },
              { name: 'clientId', label: 'Copart', type: 'select', options: clients.map((c) => [c.id, c.name]), required: true },
              { name: 'serviceType', label: 'Jenis jasa', type: 'select', options: SERVICES, noEmpty: true },
              { name: 'standard', label: 'Standar / topik', placeholder: 'ISO 9001:2015, ISO 45001…' },
              { name: 'contractNo', label: 'No. kontrak / SPK / PO' },
              { name: 'contractDate', label: 'Tanggal kontrak', type: 'date' },
              { name: 'manager', label: 'Penanggung jawab (konsultan/PM)' },
              { name: 'contractValue', label: 'Nilai kontrak (sebelum pajak)', type: 'number', min: 0, step: 'any', required: true },
              { name: 'budgetCost', label: 'Anggaran biaya', type: 'number', min: 0, step: 'any' },
              { name: 'status', label: 'Status', type: 'select', options: STATUSES, noEmpty: true },
              { name: 'startDate', label: 'Mulai', type: 'date', required: true },
              { name: 'endDate', label: 'Selesai (rencana)', type: 'date' },
              { name: 'description', label: 'Keterangan', type: 'textarea', span: true, rows: 2 },
            ]} />
            <div>
              <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Termin penagihan</span>
                {!ms.length && <button type="button" className="btn btn-ghost btn-sm" onClick={applyTemplate} disabled={!value}>Pakai pola 30/40/30</button>}
              </div>
              <div className="lines-wrap">
                <table className="lines">
                  <thead><tr><th>Nama termin</th><th style={{ width: 90 }}>%</th><th style={{ width: 170 }} className="num">Nilai</th><th style={{ width: 170 }}>Rencana tagih</th><th style={{ width: 44 }} /></tr></thead>
                  <tbody>
                    {ms.map((m, i) => (
                      <tr key={i}>
                        <td><input className="form-input" required value={m.name} onChange={(e) => setMs(ms.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></td>
                        <td><input className="form-input" type="number" min="0" max="100" step="any" value={m.percent} disabled={m.invoiced} onChange={(e) => setPercent(i, e.target.value)} /></td>
                        <td className="num"><input className="form-input" type="number" min="0" step="any" value={m.amount} disabled={m.invoiced} onChange={(e) => setMs(ms.map((x, j) => (j === i ? { ...x, amount: e.target.value, percent: value ? r2((num(e.target.value) / value) * 100) : 0 } : x)))} /></td>
                        <td><input className="form-input" type="date" value={m.dueDate} onChange={(e) => setMs(ms.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)))} /></td>
                        <td>{!m.invoiced && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMs(ms.filter((_, j) => j !== i))}><Trash2 size={15} /></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                  {ms.length > 0 && <tfoot><tr><td>Total</td><td>{r2((msTotal / (value || 1)) * 100)}%</td><td className={`num ${msTotal > value + 0.5 ? 'text-red' : ''}`}>{idr(msTotal)}</td><td colSpan={2} /></tr></tfoot>}
                </table>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setMs([...ms, { name: `Termin ${ms.length + 1}`, percent: 0, amount: 0, dueDate: '' }])}><Plus size={15} /> Tambah termin</button>
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
