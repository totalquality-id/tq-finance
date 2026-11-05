'use client';

import { useState } from 'react';
import { Save, Upload, Trash2 } from 'lucide-react';
import { Card, FormFields, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { formatDate } from '@/lib/dates';

const LONG = ['address', 'invoiceNote', 'kwitansiNote'];

function SettingCard({ s, canEdit }) {
  const { submit, busy } = useSubmit();
  const [v, setV] = useState(s.value);
  const dirty = JSON.stringify(v) !== JSON.stringify(s.value);
  const fields = Object.entries(s.fields).map(([name, label]) => ({
    name, label, disabled: !canEdit, min: 0, step: 'any',
    type: typeof s.value[name] === 'number' ? 'number' : LONG.includes(name) ? 'textarea' : 'text',
    span: LONG.includes(name), rows: 2,
  }));
  const save = () => submit(`/api/settings/${s.key}`, { method: 'PUT', body: { value: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof s.value[k] === 'number' ? Number(x) : x])) }, success: 'Pengaturan disimpan.' });
  return (
    <Card title={s.label} actions={s.updatedBy && <span className="muted">{s.updatedBy}, {formatDate(s.updatedAt)}</span>}>
      <FormFields fields={fields} values={v} setValues={setV} />
      {canEdit && <div className="row-actions" style={{ marginTop: 8 }}><button className="btn btn-primary btn-sm" disabled={busy || !dirty} onClick={save}><Save size={14} /> Simpan</button></div>}
    </Card>
  );
}

const readImage = (file) => new Promise((resolve, reject) => {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error('Gunakan PNG, JPG, atau WEBP.'));
  if (file.size > 500 * 1024) return reject(new Error('Ukuran maksimal 500 KB.'));
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(new Error('Gagal membaca file.'));
  r.readAsDataURL(file);
});

function AssetsCard({ assets, canEdit }) {
  const { submit, busy } = useSubmit();
  const { showAlert, showConfirm } = useDialog();
  const [img, setImg] = useState(assets);
  const pick = async (key, file) => {
    try {
      const data = await readImage(file);
      if (await submit('/api/settings/assets', { method: 'PUT', body: { [key]: data } })) setImg({ ...img, [key]: data });
    } catch (e) { showAlert(e.message, 'Gagal'); }
  };
  const clear = async (key, label) => {
    if (await showConfirm(`Hapus ${label}?`, 'Hapus gambar') && (await submit('/api/settings/assets', { method: 'PUT', body: { [key]: '' } }))) setImg({ ...img, [key]: '' });
  };
  const slot = (key, label, hint) => (
    <div className="asset-slot">
      <div className="form-label">{label}</div>
      <div className="asset-preview">{img[key] ? <img src={img[key]} alt={label} /> : <span className="muted">Belum diunggah</span>}</div>
      <div className="muted" style={{ fontSize: 12.5 }}>{hint}</div>
      {canEdit && (
        <div className="row-actions">
          <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}><Upload size={14} /> Unggah<input type="file" hidden accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => e.target.files[0] && pick(key, e.target.files[0])} /></label>
          {img[key] && <button className="btn btn-ghost btn-sm" onClick={() => clear(key, label.toLowerCase())}><Trash2 size={14} /></button>}
        </div>
      )}
    </div>
  );
  return (
    <Card title="Stempel & tanda tangan">
      <div className="grid-2">
        {slot('stamp', 'Stempel TQ', 'Hanya tampil di Seri TQ. PNG latar transparan.')}
        {slot('signature', 'Tanda tangan', 'Tampil di kedua seri. PNG latar transparan.')}
      </div>
    </Card>
  );
}

export default function SettingsClient({ settings, assets, canEdit }) {
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      {settings.map((s) => <SettingCard key={s.key} s={s} canEdit={canEdit} />)}
      <AssetsCard assets={assets} canEdit={canEdit} />
    </div>
  );
}
