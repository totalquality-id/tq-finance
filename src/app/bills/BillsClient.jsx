'use client';

import { useState } from 'react';
import { Plus, Edit, Ban, HandCoins, Trash2 } from 'lucide-react';
import { Badge, Card, DataTable, FilterBar, FormFields, Modal, Pager, Stat, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { AccountSelect, ItemsEditor, TotalsBox, num, r2 } from '@/components/finance';
import { addDays, formatDate, iso, todayIso } from '@/lib/dates';
import { idr, labelOf } from '@/lib/labels';

const STATUS_OPTS = [['OPEN', 'Belum lunas'], ['OVERDUE', 'Lewat jatuh tempo'], ['UNPAID', 'Belum dibayar'], ['PARTIAL', 'Dibayar sebagian'], ['PAID', 'Lunas'], ['VOID', 'Dibatalkan']];
const isOverdue = (r) => ['UNPAID', 'PARTIAL'].includes(r.status) && iso(r.dueDate) < todayIso();

export default function BillsClient({ data, page, vendors, projects, taxes, expenseAccounts, cashAccounts, defaultExpenseId, canEdit }) {
  const { submit, busy } = useSubmit();
  const { showConfirm, showPrompt } = useDialog();
  const [form, setForm] = useState(null);
  const [items, setItems] = useState([]);
  const [taxIds, setTaxIds] = useState([]);
  const [detailId, setDetailId] = useState(null);
  const [pay, setPay] = useState(null);
  const detail = data.rows.find((r) => r.id === detailId);
  const blank = () => ({ description: '', accountId: defaultExpenseId, quantity: 1, unit: 'paket', unitPrice: '' });

  const openNew = () => {
    setItems([blank()]); setTaxIds([]);
    setForm({ vendorId: '', projectId: '', vendorRef: '', date: todayIso(), dueDate: iso(addDays(new Date(todayIso()), 30)), notes: '' });
  };
  const openEdit = (r) => {
    setItems(r.items.map((it) => ({ description: it.description, accountId: it.accountId, quantity: it.quantity, unit: it.unit ?? '', unitPrice: it.unitPrice })));
    setTaxIds(r.appliedTaxes.map((t) => t.taxId));
    setForm({ id: r.id, number: r.number, vendorId: r.vendorId, projectId: r.projectId ?? '', vendorRef: r.vendorRef ?? '', date: iso(r.date), dueDate: iso(r.dueDate), notes: r.notes ?? '' });
  };
  const setValues = (fn) => setForm((s) => {
    const n = typeof fn === 'function' ? fn(s) : fn;
    if (n.vendorId !== s.vendorId) {
      const v = vendors.find((x) => x.id === n.vendorId);
      // Tenaga ahli perorangan → usulkan PPh 21; badan usaha → PPh 23 (bisa diubah).
      const code = v?.type === 'ASSOCIATE' ? 'PPH21' : null;
      if (code && !s.id) setTaxIds(taxes.filter((t) => t.code === code).map((t) => t.id));
      return { ...n, dueDate: iso(addDays(new Date(n.date), v?.paymentTermDays ?? 30)) };
    }
    return n;
  });

  const save = async (e) => {
    e.preventDefault();
    const { id, number: _n, ...body } = form;
    const payload = { ...body, items: items.map((it) => ({ ...it, quantity: num(it.quantity), unitPrice: num(it.unitPrice) })), taxIds };
    if (await submit(id ? `/api/bills/${id}` : '/api/bills', { method: id ? 'PUT' : 'POST', body: payload })) setForm(null);
  };
  const voidIt = async (r) => {
    const reason = await showPrompt(`Alasan pembatalan ${r.number}? Jurnal tagihan akan dihapus.`, 'Batalkan tagihan');
    if (reason) { await submit(`/api/bills/${r.id}/void`, { body: { reason } }); setDetailId(null); }
  };
  const deletePayment = async (p) => {
    if (await showConfirm(`Hapus pembayaran ${p.number} sebesar ${idr(p.amount)}? Jurnalnya ikut dihapus.`, 'Hapus pembayaran')) submit(`/api/bills/payments/${p.id}`, { method: 'DELETE' });
  };
  const savePay = async (e) => {
    e.preventDefault();
    if (await submit(`/api/bills/${pay.billId}/payments`, { body: { date: pay.date, cashAccountId: pay.cashAccountId, amount: num(pay.amount), notes: pay.notes } })) setPay(null);
  };
  const accName = (id) => { const a = [...expenseAccounts, ...cashAccounts].find((x) => x.id === id); return a ? `${a.code} ${a.name}` : '-'; };

  return (
    <div className="stack">
      <FilterBar filters={[
        { type: 'search', label: 'Cari', placeholder: 'No. tagihan / vendor' },
        { name: 'status', label: 'Status', type: 'select', options: STATUS_OPTS },
        { name: 'vendorId', label: 'Vendor', type: 'select', options: vendors.map((c) => [c.id, c.name]) },
        { name: 'projectId', label: 'Proyek', type: 'select', options: projects.map((p) => [p.id, p.code]) },
        { name: 'from', label: 'Dari', type: 'date' },
        { name: 'to', label: 'Sampai', type: 'date' },
      ]}>
        {canEdit && <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Catat tagihan</button>}
      </FilterBar>

      <div className="card" style={{ padding: '14px 20px' }}>
        <div className="stat-row">
          <Stat label="Total tagihan (filter)" value={idr(data.sumTotal)} />
          <Stat label="Sudah dibayar" value={idr(data.sumPaid)} tone="green" />
          <Stat label="Sisa hutang" value={idr(data.sumTotal - data.sumPaid)} tone="red" />
          <Stat label="Jumlah dokumen" value={data.total} />
        </div>
      </div>

      <div className="card">
        <DataTable rows={data.rows} onRowClick={(r) => setDetailId(r.id)} empty="Belum ada tagihan vendor."
          columns={[
            { key: 'number', label: 'Tagihan', render: (r) => (<div><strong>{r.number}</strong><div className="muted">{formatDate(r.date)}{r.vendorRef ? ' · ' + r.vendorRef : ''}</div></div>) },
            { key: 'vendor', label: 'Vendor / proyek', render: (r) => (<div>{r.vendor.name}<div className="muted">{r.project ? `${r.project.code} · ${r.project.name}` : r.items[0]?.description}</div></div>) },
            { key: 'due', label: 'Jatuh tempo', render: (r) => <span className={isOverdue(r) ? 'text-red' : ''}>{formatDate(r.dueDate)}</span> },
            { key: 'total', label: 'Total', num: true, render: (r) => idr(r.total) },
            { key: 'rest', label: 'Sisa', num: true, render: (r) => (r.status === 'VOID' ? '-' : idr(r.total - r.paid)) },
            { key: 'status', label: 'Status', render: (r) => <Badge value={isOverdue(r) ? 'OVERDUE' : r.status} label={isOverdue(r) ? `${labelOf(r.status)} · jatuh tempo` : undefined} /> },
          ]} />
      </div>
      <Pager page={page} total={data.total} />

      <Modal open={Boolean(detail)} onClose={() => setDetailId(null)} title={detail ? `Tagihan ${detail.number}` : ''} subtitle={detail?.vendor.name} size="modal-xl">
        {detail && (
          <div className="stack">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Badge value={detail.status} />{detail.project && <span className="chip">{detail.project.code} · {detail.project.name}</span>}</div>
            {detail.status === 'VOID' && <div className="notice">Dibatalkan: {detail.voidReason}</div>}
            <dl className="detail-grid">
              <div><dt>Tanggal</dt><dd>{formatDate(detail.date)}</dd></div>
              <div><dt>Jatuh tempo</dt><dd>{formatDate(detail.dueDate)}</dd></div>
              <div><dt>No. tagihan vendor</dt><dd>{detail.vendorRef ?? '-'}</dd></div>
              <div><dt>Rekening vendor</dt><dd>{detail.vendor.bankName ? `${detail.vendor.bankName} ${detail.vendor.bankAccount ?? ''} a.n. ${detail.vendor.bankHolder ?? '-'}` : '-'}</dd></div>
              <div><dt>Dicatat oleh</dt><dd>{detail.creatorName}</dd></div>
              <div><dt>Catatan</dt><dd>{detail.notes ?? '-'}</dd></div>
            </dl>
            <Card title="Rincian" padding={0}>
              <DataTable rows={detail.items} rowKey={(_, i) => i} columns={[
                { key: 'description', label: 'Uraian' },
                { key: 'acc', label: 'Akun', render: (it) => accName(it.accountId) },
                { key: 'q', label: 'Qty', num: true, render: (it) => `${Number(it.quantity)} ${it.unit ?? ''}` },
                { key: 't', label: 'Jumlah', num: true, render: (it) => idr(it.total) },
              ]} />
              <div style={{ padding: 16 }}>
                <div className="totals-box">
                  <div><span>Subtotal</span><strong>{idr(detail.subtotal)}</strong></div>
                  {detail.appliedTaxes.map((t) => <div key={t.taxId}><span>{t.name} ({t.rate}%)</span><span className={t.type === 'DEDUCTION' ? 'amount-out' : ''}>{t.type === 'DEDUCTION' ? '− ' : '+ '}{idr(t.amount)}</span></div>)}
                  <div className="grand"><span>Dibayar ke vendor</span><span>{idr(detail.total)}</span></div>
                  <div><span>Sudah dibayar</span><span className="amount-in">{idr(detail.paid)}</span></div>
                </div>
              </div>
            </Card>
            <Card title="Riwayat pembayaran" padding={0}>
              <DataTable rows={detail.payments} empty="Belum ada pembayaran." columns={[
                { key: 'number', label: 'No.' },
                { key: 'date', label: 'Tanggal', render: (p) => formatDate(p.date) },
                { key: 'acc', label: 'Dari akun', render: (p) => accName(p.cashAccountId) },
                { key: 'amount', label: 'Nominal', num: true, render: (p) => idr(p.amount) },
                { key: 'notes', label: 'Catatan', render: (p) => p.notes ?? '-' },
                ...(canEdit ? [{ key: 'x', label: '', render: (p) => <button className="btn btn-ghost btn-sm" title="Hapus" onClick={() => deletePayment(p)}><Trash2 size={15} /></button> }] : []),
              ]} />
            </Card>
            {canEdit && detail.status !== 'VOID' && (
              <div className="row-actions">
                {detail.payments.length === 0 && <button className="btn btn-danger-outline btn-sm" onClick={() => voidIt(detail)}><Ban size={15} /> Batalkan</button>}
                {detail.payments.length === 0 && <button className="btn btn-outline btn-sm" onClick={() => { const r = detail; setDetailId(null); openEdit(r); }}><Edit size={15} /> Edit</button>}
                {detail.status !== 'PAID' && <button className="btn btn-primary btn-sm" onClick={() => setPay({ billId: detail.id, number: detail.number, date: todayIso(), cashAccountId: (cashAccounts.find((a) => /bank/i.test(a.name)) ?? cashAccounts[0])?.id ?? '', amount: r2(detail.total - detail.paid), notes: '' })}><HandCoins size={15} /> Catat pembayaran</button>}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(pay)} onClose={() => setPay(null)} title={`Pembayaran ${pay?.number ?? ''}`}>
        {pay && (
          <form onSubmit={savePay}>
            <div className="form-grid">
              <div className="form-group"><label className="form-label required">Tanggal bayar</label><input className="form-input" type="date" required value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></div>
              <div className="form-group"><label className="form-label required">Dari akun</label><AccountSelect accounts={cashAccounts} required value={pay.cashAccountId} onChange={(v) => setPay({ ...pay, cashAccountId: v })} /></div>
              <div className="form-group"><label className="form-label required">Nominal</label><input className="form-input" type="number" min="0" step="any" required value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Catatan</label><input className="form-input" value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} /></div>
            </div>
            <div className="modal-footer" style={{ padding: '16px 0 0' }}><button type="button" className="btn btn-ghost" onClick={() => setPay(null)}>Batal</button><button className="btn btn-primary" disabled={busy}>Simpan pembayaran</button></div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? `Edit tagihan ${form.number}` : 'Catat tagihan vendor'} size="modal-xl">
        {form && (
          <form onSubmit={save} className="stack">
            <FormFields values={form} setValues={setValues} columns={3} fields={[
              { name: 'vendorId', label: 'Vendor / tenaga ahli', type: 'select', options: vendors.map((c) => [c.id, `${c.name}${c.type === 'ASSOCIATE' ? ' (tenaga ahli)' : ''}`]), required: true },
              { name: 'vendorRef', label: 'No. tagihan / invoice vendor' },
              { name: 'projectId', label: 'Dibebankan ke proyek', type: 'select', options: projects.map((p) => [p.id, `${p.code} — ${p.name}`]) },
              { name: 'date', label: 'Tanggal tagihan', type: 'date', required: true },
              { name: 'dueDate', label: 'Jatuh tempo', type: 'date', required: true },
            ]} />
            <ItemsEditor items={items} setItems={setItems} accounts={expenseAccounts} withAccount />
            <div className="grid-2" style={{ alignItems: 'start' }}>
              <div className="form-group"><label className="form-label">Catatan</label><textarea className="form-input" rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <TotalsBox items={items} taxes={taxes} taxIds={taxIds} setTaxIds={setTaxIds} showDiscount={false} totalLabel="Dibayar ke vendor" />
            </div>
            <div className="modal-footer" style={{ padding: 0 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Batal</button>
              <button className="btn btn-primary" disabled={busy}>{form.id ? 'Simpan perubahan' : 'Simpan & posting'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
