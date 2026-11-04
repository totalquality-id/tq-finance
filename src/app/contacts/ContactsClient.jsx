'use client';

import { useState } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { Badge, DataTable, FilterBar, FormFields, Modal, Pager, TabBar, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { tabsFor } from '@/lib/module-tabs';
import { idr, labelOf } from '@/lib/labels';

const EMPTY = { name: '', npwp: '', isPkp: false, pic: '', email: '', phone: '', address: '', city: '', industry: '', paymentTermDays: 30, bankName: '', bankAccount: '', bankHolder: '', notes: '', isActive: true };

export default function ContactsClient({ data, tab, page, canEdit }) {
  const { submit, busy } = useSubmit();
  const { showConfirm } = useDialog();
  const [form, setForm] = useState(null);
  const isClient = tab === 'CLIENT';

  const save = async (e) => {
    e.preventDefault();
    const { id, ...rest } = form;
    const body = Object.fromEntries(Object.keys(EMPTY).map((k) => [k, rest[k]]));
    body.type = rest.type;
    if (await submit(id ? `/api/contacts/${id}` : '/api/contacts', { method: id ? 'PUT' : 'POST', body })) setForm(null);
  };
  const remove = async (c) => {
    if (await showConfirm(`Hapus ${c.name}?`, 'Hapus kontak')) submit(`/api/contacts/${c.id}`, { method: 'DELETE' });
  };

  return (
    <div className="stack">
      <TabBar path="/contacts" items={tabsFor('/contacts')} current={tab} />
      <FilterBar filters={[{ type: 'search', label: 'Cari', placeholder: 'Nama / kode / PIC / kota' }, { name: 'active', label: 'Status', type: 'select', allLabel: 'Semua', options: [['1', 'Hanya aktif']] }]}>
        {canEdit && <button className="btn btn-primary" onClick={() => setForm({ ...EMPTY, type: tab })}><Plus size={16} /> Tambah {labelOf(tab).toLowerCase()}</button>}
      </FilterBar>
      <div className="card">
        <DataTable rows={data.rows} empty={`Belum ada ${labelOf(tab).toLowerCase()}.`}
          columns={[
            { key: 'name', label: 'Nama', render: (c) => (<div><strong>{c.name}</strong><div className="muted">{c.code}{c.industry ? ' · ' + c.industry : ''}</div></div>) },
            { key: 'pic', label: 'Kontak', render: (c) => (<div>{c.pic ?? '-'}<div className="muted">{[c.phone, c.email].filter(Boolean).join(' · ')}</div></div>) },
            { key: 'city', label: 'Kota', render: (c) => c.city ?? '-' },
            { key: 'npwp', label: 'NPWP', render: (c) => (c.npwp ? <span>{c.npwp}{c.isPkp && <span className="chip" style={{ marginLeft: 6 }}>PKP</span>}</span> : '-') },
            { key: 'term', label: 'Termin', num: true, render: (c) => `${c.paymentTermDays} hari` },
            isClient
              ? { key: 'ar', label: 'Piutang terbuka', num: true, render: (c) => (c.receivable ? idr(c.receivable) : '-') }
              : { key: 'ap', label: 'Hutang terbuka', num: true, render: (c) => (c.payable ? idr(c.payable) : '-') },
            { key: 'st', label: 'Status', render: (c) => <Badge value={c.isActive ? 'AKTIF' : 'NONAKTIF'} /> },
            ...(canEdit ? [{ key: 'a', label: '', render: (c) => (
              <div className="row-actions">
                <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => setForm(Object.fromEntries(Object.entries({ ...EMPTY, ...c }).map(([k, v]) => [k, v ?? ''])))}><Edit size={15} /></button>
                {!c.receivable && !c.payable && <button className="btn btn-ghost btn-sm" title="Hapus" onClick={() => remove(c)}><Trash2 size={15} /></button>}
              </div>
            ) }] : []),
          ]} />
      </div>
      <Pager page={page} total={data.total} />

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? `Edit ${form.code}` : `Tambah ${labelOf(form?.type ?? tab).toLowerCase()}`} size="modal-lg">
        {form && (
          <form onSubmit={save}>
            <FormFields values={form} setValues={setForm} fields={[
              { name: 'type', label: 'Jenis', type: 'select', options: ['CLIENT', 'VENDOR', 'ASSOCIATE'], noEmpty: true },
              { name: 'name', label: 'Nama perusahaan / perorangan', required: true },
              { name: 'industry', label: form.type === 'CLIENT' ? 'Bidang usaha' : 'Jenis barang/jasa', placeholder: form.type === 'CLIENT' ? 'mis. Garmen, Pertambangan' : 'mis. Lembaga sertifikasi, Hotel' },
              { name: 'pic', label: 'Nama PIC' },
              { name: 'phone', label: 'Telepon / WA' },
              { name: 'email', label: 'Email', type: 'email' },
              { name: 'address', label: 'Alamat', type: 'textarea', span: true, rows: 2 },
              { name: 'city', label: 'Kota' },
              { name: 'paymentTermDays', label: 'Termin pembayaran (hari)', type: 'number', min: 0 },
              { section: 'Perpajakan' },
              { name: 'npwp', label: 'NPWP (15/16 digit)' },
              { name: 'isPkp', label: 'Pengusaha Kena Pajak (PKP)', type: 'checkbox' },
              { section: 'Rekening bank', hidden: (v) => v.type === 'CLIENT' },
              { name: 'bankName', label: 'Bank', hidden: (v) => v.type === 'CLIENT' },
              { name: 'bankAccount', label: 'No. rekening', hidden: (v) => v.type === 'CLIENT' },
              { name: 'bankHolder', label: 'Atas nama', hidden: (v) => v.type === 'CLIENT' },
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
