'use client';

import { useState } from 'react';
import { Plus, Edit, Save } from 'lucide-react';
import { Badge, Card, DataTable, FormFields, Modal, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { formatDate } from '@/lib/dates';
import { labelOf } from '@/lib/labels';

function SettingCard({ s, accounts, canEdit }) {
  const { submit, busy } = useSubmit();
  const [v, setV] = useState(s.value);
  const dirty = JSON.stringify(v) !== JSON.stringify(s.value);
  const detail = accounts.filter((a) => !a.isGroup);
  const fields = Object.entries(s.fields).map(([name, label]) => (s.accountFields
    ? { name, label, type: 'select', options: detail.map((a) => [a.code, `${a.code} — ${a.name}`]), disabled: !canEdit, required: true }
    : { name, label, type: typeof s.value[name] === 'number' ? 'number' : name === 'footerNote' || name === 'address' ? 'textarea' : 'text', span: name === 'footerNote' || name === 'address', rows: 2, disabled: !canEdit, min: 0 }));
  return (
    <Card title={s.label} actions={s.updatedBy && <span className="muted">Diubah {s.updatedBy}, {formatDate(s.updatedAt)}</span>}>
      <FormFields fields={fields} values={v} setValues={setV} />
      {canEdit && (
        <div className="row-actions" style={{ marginTop: 8 }}>
          <button className="btn btn-primary btn-sm" disabled={busy || !dirty} onClick={() => submit(`/api/settings/${s.key}`, { method: 'PUT', body: { value: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof s.value[k] === 'number' ? Number(x) : x])) }, success: 'Pengaturan disimpan.' })}><Save size={14} /> Simpan</button>
        </div>
      )}
    </Card>
  );
}

const EMPTY_TAX = { code: '', name: '', rate: '', type: 'ADDITION', appliesTo: 'BOTH', salesAccountId: '', purchaseAccountId: '', isActive: true };

export default function SettingsClient({ settings, taxes, accounts, lock, canEdit }) {
  const { submit, busy } = useSubmit();
  const { showConfirm } = useDialog();
  const [lockDate, setLockDate] = useState(lock ?? '');
  const [tax, setTax] = useState(null);
  const accName = (id) => { const a = accounts.find((x) => x.id === id); return a ? `${a.code} ${a.name}` : '-'; };
  const accOpts = accounts.filter((a) => ['ASSET', 'LIABILITY'].includes(a.type) && !a.isCash).map((a) => [a.id, `${a.code} — ${a.name}`]);

  const saveLock = async (value) => {
    const msg = value ? `Tutup buku s.d. ${value}? Semua transaksi pada atau sebelum tanggal itu tidak dapat ditambah, diubah, atau dihapus.` : 'Buka kembali seluruh periode?';
    if (await showConfirm(msg, value ? 'Tutup buku' : 'Buka periode')) submit('/api/settings/lock', { method: 'PUT', body: { lockDate: value } });
  };
  const saveTax = async (e) => {
    e.preventDefault();
    const { id, createdAt: _c, updatedAt: _u, ...body } = tax;
    body.rate = Number(body.rate);
    if (await submit(id ? `/api/settings/taxes/${id}` : '/api/settings/taxes', { method: id ? 'PUT' : 'POST', body })) setTax(null);
  };

  return (
    <div className="stack">
      <Card title={'Tutup buku'}>
        <p className="muted" style={{ marginBottom: 12 }}>{lock ? `Ditutup s.d. ${formatDate(lock)}` : 'Semua periode terbuka'}</p>
        {canEdit && (
          <div className="toolbar" style={{ margin: 0 }}>
            <div className="form-group"><label className="form-label">Kunci transaksi s.d. tanggal</label><input className="form-input" type="date" value={lockDate} onChange={(e) => setLockDate(e.target.value)} /></div>
            <button className="btn btn-primary" disabled={busy || !lockDate || lockDate === lock} onClick={() => saveLock(lockDate)}>Tutup buku</button>
            {lock && <button className="btn btn-outline" disabled={busy} onClick={() => saveLock('')}>Buka semua periode</button>}
          </div>
        )}
      </Card>

      <Card title="Pajak dinamis" padding={0} actions={canEdit && <button className="btn btn-primary btn-sm" onClick={() => setTax({ ...EMPTY_TAX })}><Plus size={14} /> Tambah pajak</button>}>
        <DataTable rows={taxes} empty="Belum ada pajak." columns={[
          { key: 'code', label: 'Kode', render: (t) => <strong>{t.code}</strong> },
          { key: 'name', label: 'Nama' },
          { key: 'rate', label: 'Tarif', num: true, render: (t) => `${Number(t.rate)}%` },
          { key: 'type', label: 'Jenis', render: (t) => <Badge value={t.type} /> },
          { key: 'applies', label: 'Berlaku', render: (t) => labelOf(t.appliesTo) },
          { key: 'acc', label: 'Akun invoice / tagihan', render: (t) => (<div><div>{accName(t.salesAccountId)}</div><div className="muted">{accName(t.purchaseAccountId)}</div></div>) },
          { key: 'st', label: 'Status', render: (t) => <Badge value={t.isActive ? 'AKTIF' : 'NONAKTIF'} /> },
          ...(canEdit ? [{ key: 'e', label: '', render: (t) => <button className="btn btn-ghost btn-sm" onClick={() => setTax({ ...t, rate: Number(t.rate), salesAccountId: t.salesAccountId ?? '', purchaseAccountId: t.purchaseAccountId ?? '' })}><Edit size={15} /></button> }] : []),
        ]} />
      </Card>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {settings.map((s) => <SettingCard key={s.key} s={s} accounts={accounts} canEdit={canEdit} />)}
      </div>

      <Modal open={Boolean(tax)} onClose={() => setTax(null)} title={tax?.id ? `Edit pajak ${tax.code}` : 'Tambah pajak'}>
        {tax && (
          <form onSubmit={saveTax}>
            <FormFields values={tax} setValues={setTax} fields={[
              { name: 'code', label: 'Kode', required: true, placeholder: 'PPN / PPH23' },
              { name: 'name', label: 'Nama tampil', required: true },
              { name: 'rate', label: 'Tarif (%)', type: 'number', step: 'any', min: 0, max: 100, required: true },
              { name: 'type', label: 'Jenis', type: 'select', options: ['ADDITION', 'DEDUCTION'], noEmpty: true },
              { name: 'appliesTo', label: 'Berlaku untuk', type: 'select', options: ['SALES', 'PURCHASE', 'BOTH'], noEmpty: true },
              { name: 'salesAccountId', label: 'Akun di invoice', type: 'select', options: accOpts, hidden: (v) => v.appliesTo === 'PURCHASE' },
              { name: 'purchaseAccountId', label: 'Akun di tagihan vendor', type: 'select', options: accOpts, hidden: (v) => v.appliesTo === 'SALES' },
              { name: 'isActive', label: 'Aktif', type: 'checkbox' },
            ]} />
            <div className="modal-footer" style={{ padding: '16px 0 0' }}><button type="button" className="btn btn-ghost" onClick={() => setTax(null)}>Batal</button><button className="btn btn-primary" disabled={busy}>Simpan</button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
