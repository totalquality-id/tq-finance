'use client';

import { useState } from 'react';
import { Plus, Edit, Calculator, RotateCcw } from 'lucide-react';
import { Badge, Card, DataTable, FilterBar, FormFields, Modal, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { apiFetch } from '@/lib/client-api';
import { formatDate, iso, todayIso } from '@/lib/dates';
import { idr, labelOf } from '@/lib/labels';

const CATS = ['KOMPUTER', 'PERALATAN', 'FURNITUR', 'KENDARAAN', 'BANGUNAN', 'LAINNYA'];
const LIFE = { KOMPUTER: 48, PERALATAN: 48, FURNITUR: 48, KENDARAAN: 96, BANGUNAN: 240, LAINNYA: 48 };
// Pasangan akun bawaan per kategori (kode COA seed).
const ACCS = { KOMPUTER: ['1201', '1251'], PERALATAN: ['1201', '1251'], FURNITUR: ['1202', '1252'], KENDARAAN: ['1203', '1253'], BANGUNAN: ['1204', '1254'], LAINNYA: ['1202', '1252'] };

export default function AssetsClient({ assets, accounts, canEdit }) {
  const { submit, busy } = useSubmit();
  const { showAlert, showConfirm } = useDialog();
  const [form, setForm] = useState(null);
  const [run, setRun] = useState(null);
  const byCode = (c) => accounts.find((a) => a.code === c)?.id ?? '';
  const opts = (types) => accounts.filter((a) => types.includes(a.type) && !a.isCash).map((a) => [a.id, `${a.code} — ${a.name}`]);

  const open = (a) => {
    if (a) return setForm({ ...a, acquisitionDate: iso(a.acquisitionDate), location: a.location ?? '', notes: a.notes ?? '' });
    setForm({ name: '', category: 'KOMPUTER', acquisitionDate: todayIso(), cost: '', residualValue: 0, usefulLifeMonths: 48, assetAccountId: byCode('1201'), accumAccountId: byCode('1251'), expenseAccountId: byCode('6141'), location: '', status: 'AKTIF', notes: '' });
  };
  const setValues = (fn) => setForm((s) => {
    const n = typeof fn === 'function' ? fn(s) : fn;
    if (!s.id && n.category !== s.category) return { ...n, usefulLifeMonths: LIFE[n.category], assetAccountId: byCode(ACCS[n.category][0]) || n.assetAccountId, accumAccountId: byCode(ACCS[n.category][1]) || n.accumAccountId };
    return n;
  });
  const save = async (e) => {
    e.preventDefault();
    const { id, ...b } = form;
    const body = { name: b.name, category: b.category, acquisitionDate: b.acquisitionDate, cost: Number(b.cost), residualValue: Number(b.residualValue || 0), usefulLifeMonths: Number(b.usefulLifeMonths), assetAccountId: b.assetAccountId, accumAccountId: b.accumAccountId, expenseAccountId: b.expenseAccountId, location: b.location, status: b.status, notes: b.notes };
    if (await submit(id ? `/api/assets/${id}` : '/api/assets', { method: id ? 'PUT' : 'POST', body })) setForm(null);
  };

  const preview = async (period) => {
    try {
      const rows = await (await apiFetch('/api/assets/depreciation?period=' + period)).json();
      setRun({ period, rows });
    } catch (e) { showAlert(e.message, 'Gagal'); }
  };
  const post = async () => {
    const r = await submit('/api/assets/depreciation', { body: { period: run.period } });
    if (r) { await showAlert(`Jurnal ${r.journal} diposting untuk ${r.count} aset.`, 'Berhasil'); setRun(null); }
  };
  const undo = async () => {
    if (await showConfirm(`Batalkan penyusutan periode ${run.period}? Jurnalnya akan dihapus.`, 'Batalkan penyusutan')) {
      if (await submit('/api/assets/depreciation', { method: 'DELETE', body: { period: run.period } })) setRun(null);
    }
  };

  const total = (k) => assets.filter((a) => a.status === 'AKTIF').reduce((s, a) => s + Number(a[k]), 0);
  const thisMonth = todayIso().slice(0, 7);

  return (
    <div className="stack">
      <FilterBar filters={[{ name: 'category', label: 'Kategori', type: 'select', options: CATS }, { name: 'status', label: 'Status', type: 'select', options: ['AKTIF', 'DILEPAS'] }]}>
        {canEdit && <button className="btn btn-outline" onClick={() => preview(thisMonth)}><Calculator size={16} /> Penyusutan bulanan</button>}
        {canEdit && <button className="btn btn-primary" onClick={() => open(null)}><Plus size={16} /> Tambah aset</button>}
      </FilterBar>
      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Harga perolehan (aktif)</div><div className="kpi-value">{idr(total('cost'))}</div></div>
        <div className="kpi-card"><div className="kpi-label">Akumulasi penyusutan</div><div className="kpi-value">{idr(total('accumulated'))}</div></div>
        <div className="kpi-card"><div className="kpi-label">Nilai buku</div><div className="kpi-value">{idr(total('bookValue'))}</div></div>
        <div className="kpi-card"><div className="kpi-label">Penyusutan per bulan</div><div className="kpi-value">{idr(total('monthly'))}</div></div>
      </div>
      <Card padding={0}>
        <DataTable rows={assets} empty="Belum ada aset tetap." onRowClick={canEdit ? open : undefined}
          columns={[
            { key: 'name', label: 'Aset', render: (a) => (<div><strong>{a.name}</strong><div className="muted">{a.code} · {labelOf(a.category)}{a.location ? ' · ' + a.location : ''}</div></div>) },
            { key: 'date', label: 'Perolehan', render: (a) => formatDate(a.acquisitionDate) },
            { key: 'cost', label: 'Harga', num: true, render: (a) => idr(a.cost) },
            { key: 'life', label: 'Masa', num: true, render: (a) => `${a.usefulLifeMonths / 12} th` },
            { key: 'acc', label: 'Akumulasi', num: true, render: (a) => idr(a.accumulated) },
            { key: 'book', label: 'Nilai buku', num: true, render: (a) => idr(a.bookValue) },
            { key: 'last', label: 'Disusutkan s.d.', render: (a) => a.lastPeriod ?? '-' },
            { key: 'st', label: 'Status', render: (a) => <Badge value={a.status} /> },
            ...(canEdit ? [{ key: 'e', label: '', render: (a) => <button className="btn btn-ghost btn-sm" title="Edit" onClick={(e) => { e.stopPropagation(); open(a); }}><Edit size={15} /></button> }] : []),
          ]} />
      </Card>

      <Modal open={Boolean(run)} onClose={() => setRun(null)} title="Penyusutan bulanan">
        {run && (
          <div className="stack">
            <div className="form-group" style={{ maxWidth: 220 }}><label className="form-label">Periode</label><input className="form-input" type="month" value={run.period} onChange={(e) => e.target.value && preview(e.target.value)} /></div>
            <DataTable rows={run.rows} empty="Tidak ada aset yang disusutkan pada periode ini." columns={[
              { key: 'name', label: 'Aset', render: (r) => `${r.code} — ${r.name}` },
              { key: 'amount', label: 'Penyusutan', num: true, render: (r) => idr(r.amount) },
              { key: 'p', label: 'Status', render: (r) => (r.posted ? <span className="badge badge-success">Sudah diposting</span> : <span className="badge badge-gray">Belum</span>) },
            ]} />
            <div className="row-actions">
              {run.rows.some((r) => r.posted) && <button className="btn btn-danger-outline btn-sm" onClick={undo} disabled={busy}><RotateCcw size={15} /> Batalkan periode</button>}
              {run.rows.some((r) => !r.posted) && <button className="btn btn-primary btn-sm" onClick={post} disabled={busy}>Posting {idr(run.rows.filter((r) => !r.posted).reduce((s, r) => s + r.amount, 0))}</button>}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? `Edit ${form.code}` : 'Tambah aset tetap'} size="modal-lg">
        {form && (
          <form onSubmit={save}>
            <FormFields values={form} setValues={setValues} fields={[
              { name: 'name', label: 'Nama aset', required: true, placeholder: 'mis. Laptop Lenovo ThinkPad — konsultan' },
              { name: 'category', label: 'Kategori', type: 'select', options: CATS, noEmpty: true },
              { name: 'acquisitionDate', label: 'Tanggal perolehan', type: 'date', required: true },
              { name: 'cost', label: 'Harga perolehan', type: 'number', min: 1, step: 'any', required: true },
              { name: 'residualValue', label: 'Nilai sisa', type: 'number', min: 0, step: 'any' },
              { name: 'usefulLifeMonths', label: 'Masa manfaat (bulan)', type: 'number', min: 1, required: true },
              { name: 'assetAccountId', label: 'Akun aset', type: 'select', options: opts(['ASSET']), required: true },
              { name: 'accumAccountId', label: 'Akun akumulasi penyusutan', type: 'select', options: opts(['ASSET']), required: true },
              { name: 'expenseAccountId', label: 'Akun beban penyusutan', type: 'select', options: opts(['EXPENSE', 'COST']), required: true },
              { name: 'location', label: 'Lokasi / pemakai' },
              { name: 'status', label: 'Status', type: 'select', options: ['AKTIF', 'DILEPAS'], noEmpty: true },
              { name: 'notes', label: 'Catatan', type: 'textarea', span: true, rows: 2 },
            ]} />
            <div className="modal-footer" style={{ padding: '16px 0 0' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Batal</button>
              <button className="btn btn-primary" disabled={busy}>Simpan</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
