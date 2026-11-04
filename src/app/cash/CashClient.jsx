'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Edit, Trash2, Plus } from 'lucide-react';
import { Badge, DataTable, FilterBar, Modal, Pager, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { AccountSelect, num, r2 } from '@/components/finance';
import { formatDate, iso, todayIso } from '@/lib/dates';
import { idr } from '@/lib/labels';

const TITLES = { IN: 'Penerimaan kas/bank', OUT: 'Pengeluaran kas/bank', TRANSFER: 'Transfer antar rekening' };

export default function CashClient({ data, page, balances, accounts, projects, canEdit }) {
  const { submit, busy } = useSubmit();
  const { showConfirm } = useDialog();
  const [form, setForm] = useState(null);
  const cash = accounts.filter((a) => a.isCash);
  const counter = accounts.filter((a) => !a.isCash);
  const accName = (id) => { const a = accounts.find((x) => x.id === id) ?? balances.find((x) => x.id === id); return a ? `${a.code} ${a.name}` : '-'; };

  const open = (type, r) => {
    if (r) return setForm({ id: r.id, number: r.number, type: r.type, date: iso(r.date), cashAccountId: r.cashAccountId, toAccountId: r.toAccountId ?? '', projectId: r.projectId ?? '', counterparty: r.counterparty ?? '', description: r.description, amount: r.amount, lines: r.lines.map((l) => ({ ...l, description: l.description ?? '' })) });
    setForm({ type, date: todayIso(), cashAccountId: cash[0]?.id ?? '', toAccountId: '', projectId: '', counterparty: '', description: '', amount: '', lines: [{ accountId: '', description: '', amount: '' }] });
  };
  const setLine = (i, k, v) => setForm({ ...form, lines: form.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)) });
  const total = form ? (form.type === 'TRANSFER' ? num(form.amount) : r2(form.lines.reduce((s, l) => s + num(l.amount), 0))) : 0;

  const save = async (e) => {
    e.preventDefault();
    const { id, number: _n, ...body } = form;
    const payload = { ...body, amount: num(body.amount), lines: body.type === 'TRANSFER' ? [] : body.lines.map((l) => ({ ...l, amount: num(l.amount) })) };
    if (await submit(id ? `/api/cash/${id}` : '/api/cash', { method: id ? 'PUT' : 'POST', body: payload })) setForm(null);
  };
  const remove = async (r) => {
    if (await showConfirm(`Hapus ${r.number} (${idr(r.amount)})? Jurnalnya ikut dihapus.`, 'Hapus transaksi')) submit(`/api/cash/${r.id}`, { method: 'DELETE' });
  };

  return (
    <div className="stack">
      <div className="cash-cards">
        {balances.filter((b) => b.isActive || b.balance).map((b) => (
          <Link key={b.id} href={`/reports?tab=gl&accountId=${b.id}`} className="cash-card" style={{ textDecoration: 'none' }}>
            <div className="name">{b.code} · {b.name}</div>
            <div className={`value ${b.balance < 0 ? 'text-red' : ''}`}>{idr(b.balance)}</div>
          </Link>
        ))}
        <div className="cash-card">
          <div className="name">Total kas & bank</div>
          <div className="value">{idr(balances.reduce((s, b) => s + b.balance, 0))}</div>
        </div>
      </div>

      <FilterBar filters={[
        { type: 'search', label: 'Cari', placeholder: 'No. / keterangan / pihak' },
        { name: 'type', label: 'Jenis', type: 'select', options: ['IN', 'OUT', 'TRANSFER'] },
        { name: 'accountId', label: 'Rekening', type: 'select', options: cash.map((a) => [a.id, a.name]) },
        { name: 'from', label: 'Dari', type: 'date' },
        { name: 'to', label: 'Sampai', type: 'date' },
      ]}>
        {canEdit && (
          <>
            <button className="btn btn-outline" onClick={() => open('TRANSFER')}><ArrowLeftRight size={16} /> Transfer</button>
            <button className="btn btn-outline" onClick={() => open('OUT')}><ArrowUpRight size={16} /> Pengeluaran</button>
            <button className="btn btn-primary" onClick={() => open('IN')}><ArrowDownLeft size={16} /> Penerimaan</button>
          </>
        )}
      </FilterBar>

      <div className="card">
        <DataTable rows={data.rows} empty="Belum ada transaksi kas/bank."
          columns={[
            { key: 'number', label: 'No.', render: (r) => (<div><strong>{r.number}</strong><div className="muted">{formatDate(r.date)}</div></div>) },
            { key: 'type', label: 'Jenis', render: (r) => <Badge value={r.type} /> },
            { key: 'desc', label: 'Keterangan', render: (r) => (<div>{r.description}<div className="muted">{r.counterparty ?? ''}{r.type !== 'TRANSFER' ? (r.counterparty ? ' · ' : '') + r.lines.map((l) => accName(l.accountId)).join(', ') : ''}</div></div>) },
            { key: 'acc', label: 'Rekening', render: (r) => (r.type === 'TRANSFER' ? `${accName(r.cashAccountId)} → ${accName(r.toAccountId)}` : accName(r.cashAccountId)) },
            { key: 'amount', label: 'Nominal', num: true, render: (r) => <span className={r.type === 'IN' ? 'amount-in' : r.type === 'OUT' ? 'amount-out' : ''}>{r.type === 'OUT' ? '− ' : ''}{idr(r.amount)}</span> },
            ...(canEdit ? [{ key: 'a', label: '', render: (r) => (
              <div className="row-actions">
                <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => open(r.type, r)}><Edit size={15} /></button>
                <button className="btn btn-ghost btn-sm" title="Hapus" onClick={() => remove(r)}><Trash2 size={15} /></button>
              </div>
            ) }] : []),
          ]} />
      </div>
      <Pager page={page} total={data.total} />

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form ? (form.id ? `Edit ${form.number}` : TITLES[form.type]) : ''} size="modal-lg">
        {form && (
          <form onSubmit={save} className="stack">
            <div className="form-grid">
              <div className="form-group"><label className="form-label required">Tanggal</label><input className="form-input" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div className="form-group"><label className="form-label required">{form.type === 'TRANSFER' ? 'Dari rekening' : form.type === 'IN' ? 'Masuk ke rekening' : 'Keluar dari rekening'}</label><AccountSelect accounts={cash} required value={form.cashAccountId} onChange={(v) => setForm({ ...form, cashAccountId: v })} /></div>
              {form.type === 'TRANSFER' ? (
                <>
                  <div className="form-group"><label className="form-label required">Ke rekening</label><AccountSelect accounts={cash.filter((a) => a.id !== form.cashAccountId)} required value={form.toAccountId} onChange={(v) => setForm({ ...form, toAccountId: v })} /></div>
                  <div className="form-group"><label className="form-label required">Nominal</label><input className="form-input" type="number" min="0" step="any" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
                </>
              ) : (
                <>
                  <div className="form-group"><label className="form-label">{form.type === 'IN' ? 'Diterima dari' : 'Dibayar kepada'}</label><input className="form-input" value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} /></div>
                  <div className="form-group"><label className="form-label">Proyek (opsional)</label>
                    <select className="form-select" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                      <option value="">— Tanpa proyek —</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                    </select>
                  </div>
                </>
              )}
              <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="form-label required">Keterangan</label><input className="form-input" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={form.type === 'OUT' ? 'mis. Bayar listrik & internet kantor Oktober' : ''} /></div>
            </div>
            {form.type !== 'TRANSFER' && (
              <div className="lines-wrap">
                <table className="lines">
                  <thead><tr><th style={{ minWidth: 240 }}>Akun {form.type === 'IN' ? 'pendapatan / lawan' : 'beban / lawan'}</th><th>Uraian</th><th style={{ width: 170 }} className="num">Nominal</th><th style={{ width: 44 }} /></tr></thead>
                  <tbody>
                    {form.lines.map((l, i) => (
                      <tr key={i}>
                        <td><AccountSelect accounts={counter} required value={l.accountId} onChange={(v) => setLine(i, 'accountId', v)} /></td>
                        <td><input className="form-input" value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} /></td>
                        <td className="num"><input className="form-input" type="number" min="0" step="any" required value={l.amount} onChange={(e) => setLine(i, 'amount', e.target.value)} /></td>
                        <td>{form.lines.length > 1 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, lines: form.lines.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan={2}>Total</td><td className="num">{idr(total)}</td><td /></tr></tfoot>
                </table>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setForm({ ...form, lines: [...form.lines, { accountId: '', description: '', amount: '' }] })}><Plus size={15} /> Tambah baris</button>
              </div>
            )}
            <div className="modal-footer" style={{ padding: 0 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Batal</button>
              <button className="btn btn-primary" disabled={busy}>Simpan & posting</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
