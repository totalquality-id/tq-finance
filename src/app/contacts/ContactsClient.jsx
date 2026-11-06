'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { Badge, DataTable, FilterBar, FormFields, Modal, Pager, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { suggestShortCode } from '@/lib/domain/billing';
import { idr, labelOf } from '@/lib/labels';

const EMPTY = { name: '', shortCode: '', npwp: '', isPkp: false, pic: '', email: '', phone: '', address: '', city: '', industry: '', paymentTermDays: 14, notes: '', isActive: true };

export default function ContactsClient({ data, page, canEdit }) {
  const { submit, busy } = useSubmit();
  const { showConfirm } = useDialog();
  const [form, setForm] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(Object.keys(EMPTY).map((k) => [k, form[k]]));
    if (await submit(form.id ? `/api/contacts/${form.id}` : '/api/contacts', { method: form.id ? 'PUT' : 'POST', body })) setForm(null);
  };
  const remove = async (c) => {
    if (await showConfirm(`Hapus ${c.name}?`, 'Hapus Copart')) submit(`/api/contacts/${c.id}`, { method: 'DELETE' });
  };
  const setValues = (fn) => setForm((s) => {
    const n = typeof fn === 'function' ? fn(s) : fn;
    // Usulkan singkatan selama belum diisi manual.
    if (n.name !== s.name && (!s.shortCode || s.shortCode === suggestShortCode(s.name))) return { ...n, shortCode: suggestShortCode(n.name) };
    return n;
  });

  return (
    <div className="stack">
      <FilterBar filters={[{ type: 'search', label: 'Cari', placeholder: 'Nama / singkatan / PIC / kota' }, { name: 'active', label: 'Status', type: 'select', allLabel: 'Semua', options: [['1', 'Hanya aktif']] }]}>
        {canEdit && <button className="btn btn-primary" onClick={() => setForm({ ...EMPTY })}><Plus size={16} /> Tambah Copart</button>}
      </FilterBar>
      <div className="card">
        <DataTable rows={data.rows} empty="Belum ada Copart."
          columns={[
            { key: 'name', label: 'Copart', render: (c) => (<div><strong>{c.name}</strong><div className="muted">{c.shortCode}{c.industry ? ' · ' + c.industry : ''}</div></div>) },
            { key: 'programs', label: 'Program', render: (c) => (c.projects.length ? <span className="chips">{c.projects.map((p) => <Link key={p.id} href={`/projects?q=${encodeURIComponent(c.name)}`} className="tag" title={[labelOf(p.status), p.description].filter(Boolean).join(' · ')}>{p.standard ?? p.name}</Link>)}</span> : '-') },
            { key: 'pic', label: 'Kontak', render: (c) => (<div>{c.pic ?? '-'}<div className="muted">{[c.phone, c.email].filter(Boolean).join(' · ')}</div></div>) },
            { key: 'city', label: 'Kota', render: (c) => c.city ?? '-' },
            { key: 'notes', label: 'Keterangan', render: (c) => <span className="muted">{c.notes ?? ''}</span> },
            { key: 'ar', label: 'Piutang', num: true, render: (c) => (c.receivable ? idr(c.receivable) : '-') },
            { key: 'st', label: 'Status', render: (c) => <Badge value={c.isActive ? 'AKTIF' : 'NONAKTIF'} label={c.isActive ? 'Aktif' : 'Nonaktif'} /> },
            ...(canEdit ? [{ key: 'a', label: '', render: (c) => (
              <div className="row-actions">
                <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => setForm(Object.fromEntries(Object.entries({ ...EMPTY, ...c }).map(([k, v]) => [k, v ?? ''])))}><Edit size={15} /></button>
                {!c.receivable && <button className="btn btn-ghost btn-sm" title="Hapus" onClick={() => remove(c)}><Trash2 size={15} /></button>}
              </div>
            ) }] : []),
          ]} />
      </div>
      <Pager page={page} total={data.total} />

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? `Edit ${form.name}` : 'Tambah Copart'} size="modal-lg">
        {form && (
          <form onSubmit={save}>
            <FormFields values={form} setValues={setValues} fields={[
              { name: 'name', label: 'Nama Copart', required: true, placeholder: 'PT ...' },
              { name: 'shortCode', label: 'Singkatan (nomor invoice)', required: true, hint: `Contoh nomor: INV-${form.shortCode || 'COP'}/1276/11/26` },
              { name: 'industry', label: 'Bidang usaha' },
              { name: 'pic', label: 'PIC / Attn.' },
              { name: 'phone', label: 'Telepon / WA' },
              { name: 'email', label: 'Email', type: 'email' },
              { name: 'address', label: 'Alamat penagihan', type: 'textarea', span: true, rows: 2 },
              { name: 'city', label: 'Kota' },
              { name: 'paymentTermDays', label: 'Termin pembayaran (hari)', type: 'number', min: 0 },
              { name: 'npwp', label: 'NPWP (15/16 digit)' },
              { name: 'isPkp', label: 'PKP', type: 'checkbox' },
              { name: 'notes', label: 'Catatan', type: 'textarea', span: true, rows: 2 },
              { name: 'isActive', label: 'Aktif', type: 'checkbox' },
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
