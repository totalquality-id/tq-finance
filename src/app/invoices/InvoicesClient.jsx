'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Plus, Edit, Ban, HandCoins, Printer, Trash2 } from 'lucide-react';
import { Badge, Card, DataTable, FilterBar, FormFields, Modal, Pager, printDoc, Stat, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { AccountSelect, ItemsEditor, TotalsBox, num, r2 } from '@/components/finance';
import { addDays, formatDate, iso, todayIso } from '@/lib/dates';
import { terbilang } from '@/lib/domain/accounting';
import { idr, labelOf } from '@/lib/labels';

const STATUS_OPTS = [['OPEN', 'Belum lunas'], ['OVERDUE', 'Lewat jatuh tempo'], ['UNPAID', 'Belum dibayar'], ['PARTIAL', 'Dibayar sebagian'], ['PAID', 'Lunas'], ['VOID', 'Dibatalkan']];
const blankItem = () => ({ description: '', quantity: 1, unit: 'paket', unitPrice: '' });
const isOverdue = (r) => ['UNPAID', 'PARTIAL'].includes(r.status) && iso(r.dueDate) < todayIso();

function InvoicePrint({ inv, company, print }) {
  if (!inv) return null;
  const sisa = r2(inv.total - inv.paid);
  return (
    <div className="print-doc">
      <div className="print-doc-inner">
        <div className="print-doc-head">
          <div className="print-doc-brand">
            <img src="/brand/tq-logo.png" alt="Total Quality" />
            <div><strong>{company.name}</strong><div>{company.address}</div><div>{[company.phone, company.email].filter(Boolean).join(' · ')}</div>{company.npwp && <div>NPWP {company.npwp}</div>}</div>
          </div>
          <div className="print-doc-title"><h1>INVOICE</h1><p>{inv.number}</p></div>
        </div>
        <div className="print-doc-parties">
          <div>
            <div className="print-doc-label">Ditagihkan kepada</div>
            <strong>{inv.client.name}</strong>
            <div>{inv.client.address}{inv.client.city ? ', ' + inv.client.city : ''}</div>
            {inv.client.pic && <div>Up. {inv.client.pic}</div>}
            {inv.client.npwp && <div>NPWP {inv.client.npwp}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div><span className="print-doc-label">Tanggal</span> {formatDate(inv.date, { day: 'numeric', month: 'long', year: 'numeric' })}</div>
            <div><span className="print-doc-label">Jatuh tempo</span> {formatDate(inv.dueDate, { day: 'numeric', month: 'long', year: 'numeric' })}</div>
            {inv.reference && <div><span className="print-doc-label">No. PO/SPK</span> {inv.reference}</div>}
            {inv.project && <div><span className="print-doc-label">Proyek</span> {inv.project.name}</div>}
            {inv.taxInvoiceNo && <div><span className="print-doc-label">Faktur pajak</span> {inv.taxInvoiceNo}</div>}
          </div>
        </div>
        <table>
          <thead><tr><th style={{ width: 36 }}>No</th><th>Uraian</th><th className="num">Qty</th><th className="num">Harga</th><th className="num">Jumlah</th></tr></thead>
          <tbody>
            {inv.items.map((it, i) => (
              <tr key={i}><td>{i + 1}</td><td>{it.description}</td><td className="num">{Number(it.quantity)} {it.unit}</td><td className="num">{idr(it.unitPrice)}</td><td className="num">{idr(it.total)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="print-doc-totals">
          <div><span>Subtotal</span><span>{idr(inv.subtotal)}</span></div>
          {inv.discount > 0 && <div><span>Diskon</span><span>− {idr(inv.discount)}</span></div>}
          {inv.appliedTaxes.map((t) => <div key={t.taxId}><span>{t.name} ({t.rate}%)</span><span>{t.type === 'DEDUCTION' ? '− ' : ''}{idr(t.amount)}</span></div>)}
          <div className="grand"><span>Total dibayar</span><span>{idr(inv.total)}</span></div>
          {inv.paid > 0 && <div><span>Sudah dibayar</span><span>{idr(inv.paid)}</span></div>}
          {inv.paid > 0 && <div><span>Sisa tagihan</span><span>{idr(sisa)}</span></div>}
        </div>
        <p style={{ marginTop: 10, fontStyle: 'italic' }}>Terbilang: {terbilang(inv.total)}</p>
        <div style={{ marginTop: 18 }}>
          <div className="print-doc-label">Pembayaran ditransfer ke</div>
          <div>{print.bankName} · {print.bankAccount || '—'} · a.n. {print.bankHolder}</div>
          {print.footerNote && <p style={{ marginTop: 6, color: '#444' }}>{print.footerNote}</p>}
          {inv.notes && <p style={{ marginTop: 6 }}>{inv.notes}</p>}
        </div>
        <div className="print-doc-signs">
          <div />
          <div><div>Hormat kami,</div><div className="line" /><strong>{print.signerName || ' '}</strong><div>{print.signerTitle}</div></div>
        </div>
      </div>
    </div>
  );
}

export default function InvoicesClient({ data, page, clients, projects, taxes, revenueAccounts, cashAccounts, defaultRevenueId, company, print, canEdit }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { submit, busy } = useSubmit();
  const { showConfirm, showPrompt } = useDialog();
  const [form, setForm] = useState(null);
  const [items, setItems] = useState([blankItem()]);
  const [taxIds, setTaxIds] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [detailId, setDetailId] = useState(null);
  const [pay, setPay] = useState(null);
  const [printId, setPrintId] = useState(null);
  const detail = data.rows.find((r) => r.id === detailId);
  const printing = data.rows.find((r) => r.id === printId);

  const openNew = (preset = {}) => {
    const client = clients.find((c) => c.id === preset.clientId);
    setItems(preset.items ?? [blankItem()]);
    setTaxIds(taxes.filter((t) => ['PPN', 'PPH23'].includes(t.code)).map((t) => t.id));
    setDiscount(0);
    setForm({ clientId: '', projectId: '', milestoneId: '', date: todayIso(), dueDate: iso(addDays(new Date(todayIso()), client?.paymentTermDays ?? 30)), reference: '', taxInvoiceNo: '', revenueAccountId: defaultRevenueId, notes: '', ...preset });
  };

  // Dibuka dari halaman proyek: /invoices?new=1&projectId=..&milestoneId=..
  useEffect(() => {
    if (params.get('new') !== '1' || !canEdit) return;
    const p = projects.find((x) => x.id === params.get('projectId'));
    const m = p?.milestones.find((x) => x.id === params.get('milestoneId'));
    const client = clients.find((c) => c.id === p?.clientId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    openNew(p ? {
      clientId: p.clientId, projectId: p.id, milestoneId: m?.id ?? '', reference: p.contractNo ?? '',
      dueDate: iso(addDays(new Date(todayIso()), client?.paymentTermDays ?? 30)),
      items: m ? [{ description: `${p.name} — ${m.name} (${Number(m.percent)}%)`, quantity: 1, unit: 'termin', unitPrice: Number(m.amount) }] : [blankItem()],
    } : {});
    router.replace(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openEdit = (r) => {
    setItems(r.items.map((it) => ({ description: it.description, quantity: it.quantity, unit: it.unit ?? '', unitPrice: it.unitPrice })));
    setTaxIds(r.appliedTaxes.map((t) => t.taxId));
    setDiscount(r.discount);
    setForm({ id: r.id, number: r.number, clientId: r.clientId, projectId: r.projectId ?? '', milestoneId: '', date: iso(r.date), dueDate: iso(r.dueDate), reference: r.reference ?? '', taxInvoiceNo: r.taxInvoiceNo ?? '', revenueAccountId: r.revenueAccountId, notes: r.notes ?? '' });
  };

  const setValues = (fn) => setForm((s) => {
    const n = typeof fn === 'function' ? fn(s) : fn;
    if (n.clientId !== s.clientId) {
      const c = clients.find((x) => x.id === n.clientId);
      return { ...n, projectId: '', milestoneId: '', dueDate: iso(addDays(new Date(n.date), c?.paymentTermDays ?? 30)) };
    }
    if (n.projectId !== s.projectId) return { ...n, milestoneId: '' };
    if (n.milestoneId && n.milestoneId !== s.milestoneId) {
      const p = projects.find((x) => x.id === n.projectId);
      const m = p?.milestones.find((x) => x.id === n.milestoneId);
      if (m) setItems([{ description: `${p.name} — ${m.name} (${Number(m.percent)}%)`, quantity: 1, unit: 'termin', unitPrice: Number(m.amount) }]);
    }
    return n;
  });

  const save = async (e) => {
    e.preventDefault();
    const { id, number: _n, ...body } = form;
    const payload = { ...body, items: items.map((it) => ({ ...it, quantity: num(it.quantity), unitPrice: num(it.unitPrice) })), discount: num(discount), taxIds };
    if (id) delete payload.milestoneId;
    if (await submit(id ? `/api/invoices/${id}` : '/api/invoices', { method: id ? 'PUT' : 'POST', body: payload })) setForm(null);
  };

  const voidIt = async (r) => {
    const reason = await showPrompt(`Alasan pembatalan ${r.number}? Jurnal invoice akan dihapus.`, 'Batalkan invoice');
    if (reason) { await submit(`/api/invoices/${r.id}/void`, { body: { reason } }); setDetailId(null); }
  };
  const deletePayment = async (p) => {
    if (await showConfirm(`Hapus penerimaan ${p.number} sebesar ${idr(p.amount)}? Jurnalnya ikut dihapus.`, 'Hapus pembayaran')) submit(`/api/invoices/payments/${p.id}`, { method: 'DELETE' });
  };
  const savePay = async (e) => {
    e.preventDefault();
    if (await submit(`/api/invoices/${pay.invoiceId}/payments`, { body: { date: pay.date, cashAccountId: pay.cashAccountId, amount: num(pay.amount), bankFee: num(pay.bankFee), notes: pay.notes } })) setPay(null);
  };
  const doPrint = (r) => { setPrintId(r.id); setTimeout(printDoc, 30); };

  const clientProjects = projects.filter((p) => p.clientId === form?.clientId);
  const milestones = projects.find((p) => p.id === form?.projectId)?.milestones ?? [];

  return (
    <div className="stack">
      <FilterBar filters={[
        { type: 'search', label: 'Cari', placeholder: 'No. invoice / klien / PO' },
        { name: 'status', label: 'Status', type: 'select', options: STATUS_OPTS },
        { name: 'clientId', label: 'Klien', type: 'select', options: clients.map((c) => [c.id, c.name]) },
        { name: 'from', label: 'Dari', type: 'date' },
        { name: 'to', label: 'Sampai', type: 'date' },
      ]}>
        {canEdit && <button className="btn btn-primary" onClick={() => openNew()}><Plus size={16} /> Buat invoice</button>}
      </FilterBar>

      <div className="card" style={{ padding: '14px 20px' }}>
        <div className="stat-row">
          <Stat label="Total invoice (filter)" value={idr(data.sumTotal)} />
          <Stat label="Sudah diterima" value={idr(data.sumPaid)} tone="green" />
          <Stat label="Sisa piutang" value={idr(data.sumTotal - data.sumPaid)} tone="red" />
          <Stat label="Jumlah dokumen" value={data.total} />
        </div>
      </div>

      <div className="card">
        <DataTable rows={data.rows} onRowClick={(r) => setDetailId(r.id)} empty="Belum ada invoice."
          columns={[
            { key: 'number', label: 'Invoice', render: (r) => (<div><strong>{r.number}</strong><div className="muted">{formatDate(r.date)}</div></div>) },
            { key: 'client', label: 'Klien / proyek', render: (r) => (<div>{r.client.name}<div className="muted">{r.project ? `${r.project.code} · ${r.milestone?.name ?? r.project.name}` : r.reference ?? ''}</div></div>) },
            { key: 'due', label: 'Jatuh tempo', render: (r) => <span className={isOverdue(r) ? 'text-red' : ''}>{formatDate(r.dueDate)}</span> },
            { key: 'total', label: 'Total', num: true, render: (r) => idr(r.total) },
            { key: 'rest', label: 'Sisa', num: true, render: (r) => (r.status === 'VOID' ? '-' : idr(r.total - r.paid)) },
            { key: 'status', label: 'Status', render: (r) => <Badge value={isOverdue(r) ? 'OVERDUE' : r.status} label={isOverdue(r) ? `${labelOf(r.status)} · jatuh tempo` : undefined} /> },
          ]} />
      </div>
      <Pager page={page} total={data.total} />

      <Modal open={Boolean(detail)} onClose={() => setDetailId(null)} title={detail ? `Invoice ${detail.number}` : ''} subtitle={detail?.client.name} size="modal-xl">
        {detail && (
          <div className="stack">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Badge value={detail.status} />{isOverdue(detail) && <Badge value="OVERDUE" />}{detail.project && <span className="chip">{detail.project.code} · {detail.project.name}</span>}</div>
            {detail.status === 'VOID' && <div className="notice">Dibatalkan: {detail.voidReason}</div>}
            <dl className="detail-grid">
              <div><dt>Tanggal</dt><dd>{formatDate(detail.date)}</dd></div>
              <div><dt>Jatuh tempo</dt><dd>{formatDate(detail.dueDate)}</dd></div>
              <div><dt>No. PO/SPK</dt><dd>{detail.reference ?? '-'}</dd></div>
              <div><dt>No. faktur pajak</dt><dd>{detail.taxInvoiceNo ?? '-'}</dd></div>
              <div><dt>Dibuat oleh</dt><dd>{detail.creatorName}</dd></div>
              <div><dt>Catatan</dt><dd>{detail.notes ?? '-'}</dd></div>
            </dl>
            <Card title="Rincian" padding={0}>
              <DataTable rows={detail.items} rowKey={(_, i) => i} columns={[
                { key: 'description', label: 'Uraian' },
                { key: 'q', label: 'Qty', num: true, render: (it) => `${Number(it.quantity)} ${it.unit ?? ''}` },
                { key: 'p', label: 'Harga', num: true, render: (it) => idr(it.unitPrice) },
                { key: 't', label: 'Jumlah', num: true, render: (it) => idr(it.total) },
              ]} />
              <div style={{ padding: 16 }}>
                <div className="totals-box">
                  <div><span>Subtotal</span><strong>{idr(detail.subtotal)}</strong></div>
                  {detail.discount > 0 && <div><span>Diskon</span><span>− {idr(detail.discount)}</span></div>}
                  {detail.appliedTaxes.map((t) => <div key={t.taxId}><span>{t.name} ({t.rate}%)</span><span className={t.type === 'DEDUCTION' ? 'amount-out' : ''}>{t.type === 'DEDUCTION' ? '− ' : '+ '}{idr(t.amount)}</span></div>)}
                  <div className="grand"><span>Total</span><span>{idr(detail.total)}</span></div>
                  <div><span>Diterima</span><span className="amount-in">{idr(detail.paid)}</span></div>
                  <div><span>Sisa</span><strong>{idr(detail.total - detail.paid)}</strong></div>
                </div>
              </div>
            </Card>
            <Card title="Riwayat penerimaan" padding={0}>
              <DataTable rows={detail.payments} empty="Belum ada pembayaran." columns={[
                { key: 'number', label: 'No.' },
                { key: 'date', label: 'Tanggal', render: (p) => formatDate(p.date) },
                { key: 'acc', label: 'Ke akun', render: (p) => cashAccounts.find((a) => a.id === p.cashAccountId)?.name ?? '-' },
                { key: 'amount', label: 'Nominal', num: true, render: (p) => idr(p.amount) },
                { key: 'fee', label: 'Biaya bank', num: true, render: (p) => (p.bankFee ? idr(p.bankFee) : '-') },
                { key: 'notes', label: 'Catatan', render: (p) => p.notes ?? '-' },
                ...(canEdit ? [{ key: 'x', label: '', render: (p) => <button className="btn btn-ghost btn-sm" title="Hapus" onClick={() => deletePayment(p)}><Trash2 size={15} /></button> }] : []),
              ]} />
            </Card>
            <div className="row-actions">
              <button className="btn btn-outline btn-sm" onClick={() => doPrint(detail)}><Printer size={15} /> Cetak / PDF</button>
              {canEdit && detail.status !== 'VOID' && (
                <>
                  {detail.payments.length === 0 && <button className="btn btn-danger-outline btn-sm" onClick={() => voidIt(detail)}><Ban size={15} /> Batalkan</button>}
                  {detail.payments.length === 0 && <button className="btn btn-outline btn-sm" onClick={() => { const r = detail; setDetailId(null); openEdit(r); }}><Edit size={15} /> Edit</button>}
                  {detail.status !== 'PAID' && <button className="btn btn-primary btn-sm" onClick={() => setPay({ invoiceId: detail.id, number: detail.number, date: todayIso(), cashAccountId: (cashAccounts.find((a) => /bank/i.test(a.name)) ?? cashAccounts[0])?.id ?? '', amount: r2(detail.total - detail.paid), bankFee: '', notes: '' })}><HandCoins size={15} /> Catat penerimaan</button>}
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(pay)} onClose={() => setPay(null)} title={`Penerimaan ${pay?.number ?? ''}`}>
        {pay && (
          <form onSubmit={savePay}>
            <div className="form-grid">
              <div className="form-group"><label className="form-label required">Tanggal terima</label><input className="form-input" type="date" required value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></div>
              <div className="form-group"><label className="form-label required">Masuk ke akun</label><AccountSelect accounts={cashAccounts} required value={pay.cashAccountId} onChange={(v) => setPay({ ...pay, cashAccountId: v })} /></div>
              <div className="form-group"><label className="form-label required">Nominal piutang dilunasi</label><input className="form-input" type="number" min="0" step="any" required value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Biaya transfer dipotong bank</label><input className="form-input" type="number" min="0" step="any" value={pay.bankFee} onChange={(e) => setPay({ ...pay, bankFee: e.target.value })} /><div className="form-hint">Dana masuk rekening: {idr(num(pay.amount) - num(pay.bankFee))}</div></div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="form-label">Catatan</label><input className="form-input" value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} placeholder="mis. Transfer BCA, bukti potong PPh 23 No. ..." /></div>
            </div>
            <div className="modal-footer" style={{ padding: '16px 0 0' }}><button type="button" className="btn btn-ghost" onClick={() => setPay(null)}>Batal</button><button className="btn btn-primary" disabled={busy}>Simpan penerimaan</button></div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? `Edit invoice ${form.number}` : 'Buat invoice'} size="modal-xl">
        {form && (
          <form onSubmit={save} className="stack">
            <FormFields values={form} setValues={setValues} columns={3} fields={[
              { name: 'clientId', label: 'Klien', type: 'select', options: clients.map((c) => [c.id, c.name]), required: true },
              { name: 'projectId', label: 'Proyek (opsional)', type: 'select', options: clientProjects.map((p) => [p.id, `${p.code} — ${p.name}`]) },
              ...(form.id ? [] : [{ name: 'milestoneId', label: 'Termin', type: 'select', options: milestones.map((m) => [m.id, `${m.name} · ${idr(m.amount)}`]), hidden: (v) => !v.projectId }]),
              { name: 'date', label: 'Tanggal invoice', type: 'date', required: true },
              { name: 'dueDate', label: 'Jatuh tempo', type: 'date', required: true },
              { name: 'reference', label: 'No. PO / SPK klien' },
              { name: 'revenueAccountId', label: 'Akun pendapatan', type: 'select', options: revenueAccounts.map((a) => [a.id, `${a.code} — ${a.name}`]), required: true, noEmpty: true },
              { name: 'taxInvoiceNo', label: 'No. faktur pajak' },
            ]} />
            <ItemsEditor items={items} setItems={setItems} />
            <div className="grid-2" style={{ alignItems: 'start' }}>
              <div className="form-group"><label className="form-label">Catatan pada invoice</label><textarea className="form-input" rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <TotalsBox items={items} discount={discount} setDiscount={setDiscount} taxes={taxes} taxIds={taxIds} setTaxIds={setTaxIds} totalLabel="Total dibayar klien" />
            </div>
            <div className="modal-footer" style={{ padding: 0 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Batal</button>
              <button className="btn btn-primary" disabled={busy}>{form.id ? 'Simpan perubahan' : 'Simpan & posting'}</button>
            </div>
          </form>
        )}
      </Modal>

      <InvoicePrint inv={printing} company={company} print={print} />
    </div>
  );
}
