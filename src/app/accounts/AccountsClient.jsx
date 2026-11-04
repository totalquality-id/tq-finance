'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Edit, Trash2, Search } from 'lucide-react';
import { Badge, FormFields, Modal, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { ACCOUNT_TYPES, NORMAL_BALANCE } from '@/lib/domain/accounting';
import { acc, labelOf } from '@/lib/labels';

const EMPTY = { code: '', name: '', type: 'EXPENSE', normalBalance: 'DEBIT', isGroup: false, level: 3, isCash: false, isActive: true, description: '' };

export default function AccountsClient({ accounts, canEdit }) {
  const { submit, busy } = useSubmit();
  const { showConfirm } = useDialog();
  const [form, setForm] = useState(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');

  const rows = useMemo(() => accounts.filter((a) => (!type || a.type === type) && (!q || (a.code + ' ' + a.name).toLowerCase().includes(q.toLowerCase()))), [accounts, q, type]);

  const save = async (e) => {
    e.preventDefault();
    const { id, ...body } = form;
    if (await submit(id ? `/api/accounts/${id}` : '/api/accounts', { method: id ? 'PUT' : 'POST', body: { code: body.code, name: body.name, type: body.type, normalBalance: body.normalBalance, isGroup: body.isGroup, level: Number(body.level), isCash: body.isCash, isActive: body.isActive, description: body.description } })) setForm(null);
  };
  const remove = async (a) => {
    if (await showConfirm(`Hapus akun ${a.code} ${a.name}?`, 'Hapus akun')) submit(`/api/accounts/${a.id}`, { method: 'DELETE' });
  };

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="form-group" style={{ position: 'relative', minWidth: 240 }}>
          <label className="form-label">Cari</label>
          <Search size={17} style={{ position: 'absolute', left: 12, bottom: 12.5, color: 'var(--gray-400)' }} />
          <input className="form-input" style={{ paddingLeft: 38 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kode / nama akun" />
        </div>
        <div className="form-group">
          <label className="form-label">Tipe</label>
          <select className="form-select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Semua</option>
            {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{labelOf(t)}</option>)}
          </select>
        </div>
        <div className="spacer" />
        {canEdit && <button className="btn btn-primary" onClick={() => setForm({ ...EMPTY })}><Plus size={16} /> Tambah akun</button>}
      </div>

      <div className="card report-wrap">
        <table className="report">
          <thead>
            <tr><th style={{ width: 110 }}>Kode</th><th>Nama akun</th><th>Tipe</th><th>Saldo normal</th><th className="num">Saldo</th><th style={{ width: 110 }} /></tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className={a.isGroup ? (a.level === 1 ? 'head' : 'sub') : ''} style={{ opacity: a.isActive ? 1 : 0.55 }}>
                <td style={{ paddingLeft: 12 + (a.level - 1) * 14 }}>{a.code}</td>
                <td style={{ paddingLeft: 12 + (a.level - 1) * 14 }}>
                  {a.isGroup ? a.name : <Link href={`/reports?tab=gl&accountId=${a.id}`}>{a.name}</Link>}
                  {a.isCash && <span className="chip" style={{ marginLeft: 8 }}>Kas/Bank</span>}
                  {!a.isActive && <span className="chip" style={{ marginLeft: 8 }}>Nonaktif</span>}
                </td>
                <td>{a.isGroup ? '' : <Badge value={a.type} label={labelOf(a.type)} />}</td>
                <td>{a.isGroup ? '' : labelOf(a.normalBalance)}</td>
                <td className="num">{acc(a.balance)}</td>
                <td>
                  {canEdit && (
                    <div className="row-actions">
                      <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => setForm({ ...EMPTY, ...a, description: a.description ?? '' })}><Edit size={15} /></button>
                      {!a.used && <button className="btn btn-ghost btn-sm" title="Hapus" onClick={() => remove(a)}><Trash2 size={15} /></button>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? `Edit akun ${form.code}` : 'Tambah akun'}>
        {form && (
          <form onSubmit={save}>
            <FormFields values={form} setValues={(fn) => setForm((s) => { const n = typeof fn === 'function' ? fn(s) : fn; return n.type !== s.type ? { ...n, normalBalance: NORMAL_BALANCE[n.type] } : n; })} fields={[
              { name: 'code', label: 'Kode akun', required: true },
              { name: 'name', label: 'Nama akun', required: true },
              { name: 'type', label: 'Tipe', type: 'select', options: ACCOUNT_TYPES.map((t) => [t, labelOf(t)]), noEmpty: true },
              { name: 'normalBalance', label: 'Saldo normal', type: 'select', options: [['DEBIT', 'Debit'], ['CREDIT', 'Kredit']], noEmpty: true },
              { name: 'level', label: 'Level', type: 'select', options: [[1, '1 — Grup utama'], [2, '2 — Sub-grup'], [3, '3 — Detail'], [4, '4 — Rinci']], noEmpty: true },
              { name: 'description', label: 'Keterangan' },
              { name: 'isGroup', label: 'Akun grup (judul, tidak bisa dijurnal)', type: 'checkbox' },
              { name: 'isCash', label: 'Akun kas / bank', type: 'checkbox' },
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
