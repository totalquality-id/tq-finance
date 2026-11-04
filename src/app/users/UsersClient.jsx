'use client';

import { useState } from 'react';
import { UserPlus, Edit, KeyRound } from 'lucide-react';
import { Badge, DataTable, FormFields, Modal, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { ROLE_LABELS, ROLES } from '@/lib/access';
import { formatDate } from '@/lib/dates';

const EMPTY = { name: '', email: '', password: '', role: 'STAF_KEUANGAN', isActive: true };

export default function UsersClient({ users }) {
  const { submit, busy } = useSubmit();
  const { showAlert, showConfirm } = useDialog();
  const [form, setForm] = useState(null);

  const fields = [
    { name: 'name', label: 'Nama lengkap', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'role', label: 'Peran', type: 'select', options: ROLES.map((r) => [r, ROLE_LABELS[r]]), required: true, noEmpty: true },
    { name: 'password', label: form?.id ? 'Kata sandi baru (opsional)' : 'Kata sandi', type: 'password', required: !form?.id, hint: 'Minimal 10 karakter.' },
    { name: 'isActive', label: 'Akun aktif', type: 'checkbox' },
  ];

  const save = async (e) => {
    e.preventDefault();
    const { id, ...body } = form;
    if (!body.password) delete body.password;
    if (await submit(id ? `/api/users/${id}` : '/api/users', { method: id ? 'PUT' : 'POST', body })) setForm(null);
  };

  const reset = async (u) => {
    if (!(await showConfirm(`Reset kata sandi ${u.name}? Sesi aktif akan keluar.`))) return;
    const r = await submit(`/api/users/${u.id}/reset`, { refresh: false });
    if (r?.temporaryPassword) await showAlert(`Kata sandi sementara: ${r.temporaryPassword} — sampaikan secara langsung dan minta pengguna menggantinya.`, 'Reset berhasil');
  };

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setForm({ ...EMPTY })}><UserPlus size={17} /> Tambah pengguna</button>
      </div>
      <div className="card">
        <DataTable
          rows={users}
          columns={[
            { key: 'name', label: 'Pengguna', render: (u) => (<div><strong>{u.name}</strong><div className="muted">{u.email}</div></div>) },
            { key: 'role', label: 'Peran', render: (u) => <span className="badge badge-navy">{ROLE_LABELS[u.role]}</span> },
            { key: 'isActive', label: 'Status', render: (u) => <Badge value={u.isActive ? 'AKTIF' : 'NONAKTIF'} /> },
            { key: 'lastLoginAt', label: 'Login terakhir', render: (u) => formatDate(u.lastLoginAt) },
            {
              key: 'act', label: 'Aksi', render: (u) => (
                <div className="row-actions">
                  <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => setForm({ ...EMPTY, ...u, password: '' })}><Edit size={15} /></button>
                  <button className="btn btn-ghost btn-sm" title="Reset kata sandi" onClick={() => reset(u)}><KeyRound size={15} /></button>
                </div>
              ),
            },
          ]}
        />
      </div>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? 'Edit pengguna' : 'Tambah pengguna'}>
        {form && (
          <form onSubmit={save}>
            <FormFields fields={fields} values={form} setValues={setForm} />
            <div className="modal-footer" style={{ padding: '16px 0 0' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Batal</button>
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
