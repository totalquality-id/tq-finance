'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { Card, DataTable, FormFields, Modal, SectionTabs, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { formatDate, todayIso } from '@/lib/dates';
import { acc, idr } from '@/lib/labels';

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const monthName = (p) => `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;

function usePush() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (k, v) => { const n = new URLSearchParams(params.toString()); n.set(k, v); router.push(pathname + '?' + n); };
}

function Ppn({ data, year }) {
  const push = usePush();
  const sum = (k) => data.rows.reduce((s, r) => s + r[k], 0);
  return (
    <div className="stack">
      <div className="toolbar"><div className="form-group"><label className="form-label">Tahun</label><input className="form-input" type="number" value={year} onChange={(e) => e.target.value.length === 4 && push('year', e.target.value)} style={{ width: 120 }} /></div></div>
      <Card title={`Rekap PPN ${year}`} padding={0}>
        <div className="report-wrap">
          <table className="report">
            <thead><tr><th>Masa</th><th className="num">PPN Keluaran</th><th className="num">PPN Masukan</th><th className="num">Kurang / (lebih) bayar</th></tr></thead>
            <tbody>
              {data.rows.map((r) => <tr key={r.period}><td>{monthName(r.period)}</td><td className="num">{acc(r.output)}</td><td className="num">{acc(r.input)}</td><td className={`num ${r.net > 0 ? 'text-red' : ''}`}>{acc(r.net)}</td></tr>)}
              <tr className="grand"><td>Total</td><td className="num">{acc(sum('output'))}</td><td className="num">{acc(sum('input'))}</td><td className="num">{acc(sum('net'))}</td></tr>
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Invoice dengan PPN" padding={0}>
        <DataTable rows={data.invoices} empty="Belum ada invoice ber-PPN." columns={[
          { key: 'number', label: 'Invoice', render: (r) => <Link href={`/invoices?q=${r.number}`}>{r.number}</Link> },
          { key: 'date', label: 'Tanggal', render: (r) => formatDate(r.date) },
          { key: 'client', label: 'Copart', render: (r) => (<div>{r.client.name}<div className="muted">{r.client.npwp ?? 'NPWP belum diisi'}</div></div>) },
          { key: 'faktur', label: 'No. faktur', render: (r) => r.taxInvoiceNo ?? <span className="text-orange">Belum diisi</span> },
          { key: 'dpp', label: 'DPP', num: true, render: (r) => idr(r.subtotal - r.discount) },
          { key: 'ppn', label: 'PPN', num: true, render: (r) => idr(r.taxAdd) },
        ]} />
      </Card>
    </div>
  );
}

function Withholding({ data, period }) {
  const push = usePush();
  const cols = (party) => [
    { key: 'number', label: 'Dokumen', render: (r) => (<div><strong>{r.number}</strong><div className="muted">{formatDate(r.date)}</div></div>) },
    { key: 'party', label: party, render: (r) => (<div>{r.party}<div className="muted">{r.npwp ?? 'NPWP belum diisi'}</div></div>) },
    { key: 'tax', label: 'Jenis', render: (r) => `${r.tax} (${r.rate}%)` },
    { key: 'base', label: 'Dasar pemotongan', num: true, render: (r) => idr(r.base) },
    { key: 'amount', label: 'PPh', num: true, render: (r) => idr(r.amount) },
  ];
  const sum = (rows) => idr(rows.reduce((s, r) => s + r.amount, 0));
  return (
    <div className="stack">
      <div className="toolbar"><div className="form-group"><label className="form-label">Masa pajak</label><input className="form-input" type="month" value={period} onChange={(e) => e.target.value && push('period', e.target.value)} /></div></div>
      <div className="grid-2">
        {data.payables.map((p) => (
          <div key={p.id} className="cash-card"><div className="name">Saldo {p.code} {p.name}</div><div className="value">{idr(p.balance)}</div></div>
        ))}
      </div>
      <Card title={`PPh dipotong TQ atas tagihan vendor — wajib disetor (${sum(data.byUs)})`} padding={0}>
        <DataTable rows={data.byUs} empty="Tidak ada pemotongan pada masa ini." columns={cols('Vendor / tenaga ahli')} />
      </Card>
      <Card title={`PPh 23 dipotong Copart atas invoice — kredit pajak (${sum(data.byClients)})`} padding={0}>
        <DataTable rows={data.byClients} empty="Tidak ada pemotongan pada masa ini." columns={cols('Copart')} />
      </Card>
    </div>
  );
}

function Payments({ data, year, accounts, canEdit }) {
  const { submit, busy } = useSubmit();
  const { showConfirm } = useDialog();
  const push = usePush();
  const [form, setForm] = useState(null);
  const cash = accounts.filter((a) => a.isCash);
  const taxAccs = accounts.filter((a) => ['LIABILITY', 'INCOME_TAX', 'EXPENSE'].includes(a.type));
  const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1);
  const open = (p) => setForm({ taxCode: p?.taxCode ?? 'PPH23', period: lastMonth.toISOString().slice(0, 7), date: todayIso(), cashAccountId: cash[0]?.id ?? '', taxAccountId: p?.id ?? '', amount: p?.balance > 0 ? p.balance : '', billingCode: '', ntpn: '', notes: '' });
  const save = async (e) => { e.preventDefault(); if (await submit('/api/tax/payments', { body: { ...form, amount: Number(form.amount) } })) setForm(null); };
  const remove = async (r) => { if (await showConfirm(`Hapus setoran ${r.number}?`, 'Hapus setoran')) submit(`/api/tax/payments/${r.id}`, { method: 'DELETE' }); };
  return (
    <div className="stack">
      <div className="toolbar">
        <div className="form-group"><label className="form-label">Tahun</label><input className="form-input" type="number" value={year} onChange={(e) => e.target.value.length === 4 && push('year', e.target.value)} style={{ width: 120 }} /></div>
        <div className="spacer" />
        {canEdit && <button className="btn btn-primary" onClick={() => open(null)}><Plus size={16} /> Catat setoran</button>}
      </div>
      <Card title="Saldo hutang pajak" padding={0}>
        <DataTable rows={data.payables} empty="Atur akun pajak di Pengaturan → Pajak dinamis." columns={[
          { key: 'acc', label: 'Akun', render: (p) => `${p.code} ${p.name}` },
          { key: 'bal', label: 'Saldo', num: true, render: (p) => idr(p.balance) },
          ...(canEdit ? [{ key: 'a', label: '', render: (p) => p.balance > 0 && <button className="btn btn-outline btn-sm" onClick={() => open(p)}>Setor</button> }] : []),
        ]} />
      </Card>
      <Card title={`Riwayat setoran ${year}`} padding={0}>
        <DataTable rows={data.payments} empty="Belum ada setoran." columns={[
          { key: 'number', label: 'No.', render: (r) => (<div><strong>{r.number}</strong><div className="muted">{formatDate(r.date)}</div></div>) },
          { key: 'tax', label: 'Pajak / masa', render: (r) => `${r.taxCode} · ${monthName(r.period)}` },
          { key: 'acc', label: 'Akun', render: (r) => (<div>{r.taxAccount}<div className="muted">dari {r.cashAccount}</div></div>) },
          { key: 'ntpn', label: 'Billing / NTPN', render: (r) => (<div>{r.billingCode ?? '-'}<div className="muted">{r.ntpn ?? ''}</div></div>) },
          { key: 'amount', label: 'Nominal', num: true, render: (r) => idr(r.amount) },
          ...(canEdit ? [{ key: 'x', label: '', render: (r) => <button className="btn btn-ghost btn-sm" onClick={() => remove(r)}><Trash2 size={15} /></button> }] : []),
        ]} />
      </Card>
      <Modal open={Boolean(form)} onClose={() => setForm(null)} title="Catat setoran pajak">
        {form && (
          <form onSubmit={save}>
            <FormFields values={form} setValues={setForm} fields={[
              { name: 'taxCode', label: 'Jenis pajak', type: 'select', options: [['PPH21', 'PPh 21'], ['PPH23', 'PPh 23'], ['PPH4_2', 'PPh 4(2)'], ['PPN', 'PPN'], ['PPH25', 'PPh 25'], ['PPH29', 'PPh 29']], noEmpty: true },
              { name: 'period', label: 'Masa pajak', type: 'month', required: true },
              { name: 'date', label: 'Tanggal setor', type: 'date', required: true },
              { name: 'amount', label: 'Nominal', type: 'number', min: 1, step: 'any', required: true },
              { name: 'taxAccountId', label: 'Akun pajak', type: 'select', options: taxAccs.map((a) => [a.id, `${a.code} — ${a.name}`]), required: true },
              { name: 'cashAccountId', label: 'Dibayar dari', type: 'select', options: cash.map((a) => [a.id, `${a.code} — ${a.name}`]), required: true },
              { name: 'billingCode', label: 'Kode billing' },
              { name: 'ntpn', label: 'NTPN' },
              { name: 'notes', label: 'Catatan', span: true },
            ]} />
            <div className="modal-footer" style={{ padding: '16px 0 0' }}><button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Batal</button><button className="btn btn-primary" disabled={busy}>Simpan</button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}

export default function TaxClient({ tab, data, year, period, accounts, canEdit }) {
  return (
    <SectionTabs path="/tax" current={tab} keep={['year']}>
      {tab === 'ppn' && <Ppn data={data} year={year} />}
      {tab === 'withholding' && <Withholding data={data} period={period} />}
      {tab === 'payments' && <Payments data={data} year={year} accounts={accounts} canEdit={canEdit} />}
    </SectionTabs>
  );
}
