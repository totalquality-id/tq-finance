'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Plus, Edit, Ban, HandCoins, Printer, Trash2, Send, PhoneCall, Download, Stamp } from 'lucide-react';
import { Badge, Card, DataTable, FilterBar, FormFields, Modal, Pager, Stat, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { ItemsEditor, TotalsBox, blankItem, num, r2 } from '@/components/finance';
import { addDays, formatDate, iso, todayIso } from '@/lib/dates';
import { KINDS, meteraiRequired } from '@/lib/domain/billing';
import { termKind } from '@/lib/domain/programs';
import { idr, labelOf } from '@/lib/labels';

const STATUS_OPTS = [['OPEN', 'Belum lunas'], ['NOT_SENT', 'Belum dikirim'], ['FOLLOW_UP', 'Perlu follow up'], ['OVERDUE', 'Lewat jatuh tempo'], ['PAID', 'Lunas'], ['VOID', 'Dibatalkan']];
const isOverdue = (r) => ['UNPAID', 'PARTIAL'].includes(r.status) && iso(r.dueDate) < todayIso();
const sisa = (r) => r2(Number(r.total) - Number(r.paid));

function SeriesPicker({ value, onChange, disabled }) {
  const opts = [['TQ', 'ON — Seri TQ', 'Kop surat & stempel · PPN · rekening PT'], ['OPS', 'OFF — Seri Operasional', 'Polos · tanpa PPN · rekening operasional']];
  return (
    <div className="series-picker" role="radiogroup" aria-label="Seri invoice">
      {opts.map(([v, title, desc]) => (
        <label key={v} className={`series-option ${value === v ? 'active' : ''} ${disabled ? 'disabled' : ''}`}>
          <input type="radio" name="series" value={v} checked={value === v} disabled={disabled} onChange={() => onChange(v)} />
          <span className="series-title">{title}</span>
          <span className="series-desc">{desc}</span>
        </label>
      ))}
    </div>
  );
}

export default function InvoicesClient({ data, page, clients, projects, doc, banks, canEdit }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { submit, busy } = useSubmit();
  const { showConfirm, showPrompt } = useDialog();
  const [form, setForm] = useState(null);
  const [items, setItems] = useState([blankItem()]);
  const [taxMode, setTaxMode] = useState('PPN_INCLUDED');
  const [detailId, setDetailId] = useState(null);
  const [pay, setPay] = useState(null);
  const [send, setSend] = useState(null);
  const [fu, setFu] = useState(null);
  const [mtr, setMtr] = useState(null);
  const detail = data.rows.find((r) => r.id === detailId);
  const due = (from, clientId) => iso(addDays(new Date(from), clients.find((c) => c.id === clientId)?.paymentTermDays ?? doc.defaultDueDays));

  const openNew = (preset = {}) => {
    setItems(preset.items ?? [blankItem()]);
    setTaxMode('PPN_INCLUDED');
    setForm({ series: 'TQ', docType: 'INVOICE', kind: 'TERMIN', layout: 'JASA', clientId: '', projectId: '', milestoneId: '', date: todayIso(), dueDate: iso(addDays(new Date(todayIso()), doc.defaultDueDays)), attn: '', reference: '', subject: '', taxInvoiceNo: '', notes: '', internalNote: '', seq: '', meterai: false, ...preset });
  };
  const termItem = (p, m) => [{ description: `Jasa ${p.standard ?? p.name} — ${m.name}`, detail: `Termin ${m.sequence}/${p._count.milestones}`, amount: Number(m.amount) }];
  const termPreset = (p, m) => ({ kind: termKind(m.name, m.sequence - 1, p._count.milestones), subject: '' });

  // Dibuka dari kontrak / notifikasi: /invoices?new=1&projectId=..&milestoneId=..
  useEffect(() => {
    if (params.get('new') !== '1' || !canEdit) return;
    const p = projects.find((x) => x.id === params.get('projectId'));
    const m = p?.milestones.find((x) => x.id === params.get('milestoneId'));
    const client = clients.find((c) => c.id === p?.clientId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    openNew(p ? { ...(m ? termPreset(p, m) : {}), clientId: p.clientId, projectId: p.id, milestoneId: m?.id ?? '', reference: p.spkNo ?? p.contractNo ?? '', attn: client?.pic ?? '', dueDate: due(todayIso(), p.clientId), items: m ? termItem(p, m) : [blankItem()] } : {});
    router.replace(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openEdit = (r) => {
    setItems(r.items.map((it) => ({ ...blankItem(), ...it, detail: it.detail ?? '', route: it.route ?? '', ref: it.ref ?? '' })));
    setTaxMode(r.taxMode);
    setForm({ id: r.id, number: r.number, series: r.series, docType: r.docType, kind: r.kind, layout: r.layout, clientId: r.clientId, projectId: r.projectId ?? '', milestoneId: '', date: iso(r.date), dueDate: iso(r.dueDate), attn: r.attn ?? '', reference: r.reference ?? '', subject: r.subject ?? '', taxInvoiceNo: r.taxInvoiceNo ?? '', notes: r.notes ?? '', internalNote: r.internalNote ?? '', seq: '', meterai: r.meterai });
  };

  const setValues = (fn) => setForm((s) => {
    const n = typeof fn === 'function' ? fn(s) : fn;
    if (n.clientId !== s.clientId) {
      const c = clients.find((x) => x.id === n.clientId);
      return { ...n, projectId: '', milestoneId: '', attn: s.attn || c?.pic || '', dueDate: due(n.date, n.clientId) };
    }
    if (n.projectId !== s.projectId) {
      const p = projects.find((x) => x.id === n.projectId);
      return { ...n, milestoneId: '', reference: s.reference || p?.spkNo || p?.contractNo || '' };
    }
    if (n.milestoneId && n.milestoneId !== s.milestoneId) {
      const p = projects.find((x) => x.id === n.projectId);
      const m = p?.milestones.find((x) => x.id === n.milestoneId);
      if (m) { setItems(termItem(p, m)); return { ...n, ...termPreset(p, m) }; }
    }
    if (n.kind !== s.kind && ['AKOMODASI', 'TRANSPORTASI', 'KONSUMSI'].includes(n.kind)) return { ...n, series: 'OPS', layout: n.kind === 'TRANSPORTASI' ? 'TIKET' : 'JASA' };
    if (n.date !== s.date) return { ...n, dueDate: due(n.date, n.clientId) };
    return n;
  });

  const save = async (e) => {
    e.preventDefault();
    const { id, number: _n, ...body } = form;
    const payload = { ...body, taxMode: body.series === 'OPS' ? 'NONE' : taxMode, items: items.map((it) => ({ description: it.description, detail: it.detail, route: it.route, ref: it.ref, amount: num(it.amount) })) };
    if (id) { delete payload.milestoneId; delete payload.seq; delete payload.series; }
    if (await submit(id ? `/api/invoices/${id}` : '/api/invoices', { method: id ? 'PUT' : 'POST', body: payload })) setForm(null);
  };
  const voidIt = async (r) => {
    const reason = await showPrompt(`Alasan pembatalan ${r.number}?`, 'Batalkan invoice');
    if (reason) { await submit(`/api/invoices/${r.id}/void`, { body: { reason } }); setDetailId(null); }
  };
  const deletePayment = async (p) => {
    if (await showConfirm(`Hapus pembayaran ${formatDate(p.date)} sebesar ${idr(p.amount)}?`, 'Hapus pembayaran')) submit(`/api/invoices/payments/${p.id}`, { method: 'DELETE' });
  };
  const savePay = async (e) => {
    e.preventDefault();
    const { invoiceId, number: _n, ...body } = pay;
    if (await submit(`/api/invoices/${invoiceId}/payments`, { body: { ...body, amount: num(body.amount), pph23: num(body.pph23), bankFee: num(body.bankFee) } })) setPay(null);
  };
  const saveMeterai = async (e) => { e.preventDefault(); const { invoiceId, ...body } = mtr; if (await submit(`/api/invoices/${invoiceId}/meterai`, { method: 'PUT', body })) setMtr(null); };
  const saveSend = async (e) => { e.preventDefault(); const { invoiceId, ...body } = send; if (await submit(`/api/invoices/${invoiceId}/send`, { body })) setSend(null); };
  const saveFu = async (e) => { e.preventDefault(); const { invoiceId, ...body } = fu; if (await submit(`/api/invoices/${invoiceId}/follow-ups`, { body })) setFu(null); };

  const clientProjects = projects.filter((p) => p.clientId === form?.clientId);
  const milestones = projects.find((p) => p.id === form?.projectId)?.milestones ?? [];
  const exportHref = '/api/invoices/export?' + new URLSearchParams(Object.fromEntries(params));

  return (
    <div className="stack">
      <FilterBar filters={[
        { type: 'search', label: 'Cari', placeholder: 'No. invoice / Copart / PO' },
        { name: 'status', label: 'Status', type: 'select', options: STATUS_OPTS },
        { name: 'series', label: 'Seri', type: 'select', options: [['TQ', 'ON'], ['OPS', 'OFF']] },
        { name: 'kind', label: 'Jenis', type: 'select', options: KINDS },
        { name: 'clientId', label: 'Copart', type: 'select', options: clients.map((c) => [c.id, c.name]) },
        { name: 'from', label: 'Dari', type: 'date' },
        { name: 'to', label: 'Sampai', type: 'date' },
      ]}>
        <a className="btn btn-outline" href={exportHref}><Download size={16} /> Excel</a>
        {canEdit && <button className="btn btn-primary" onClick={() => openNew()}><Plus size={16} /> Buat invoice</button>}
      </FilterBar>

      <div className="card" style={{ padding: '14px 20px' }}>
        <div className="stat-row">
          <Stat label="Total tagihan" value={idr(data.sumTotal)} />
          <Stat label="Diterima" value={idr(data.sumPaid)} />
          <Stat label="Sisa piutang" value={idr(data.sumTotal - data.sumPaid)} />
          <Stat label="Jumlah" value={data.total} />
        </div>
      </div>

      <div className="card">
        <DataTable rows={data.rows} onRowClick={(r) => setDetailId(r.id)} empty="Belum ada invoice."
          columns={[
            { key: 'number', label: 'Invoice', render: (r) => (<div><strong>{r.number}</strong><div className="muted">{formatDate(r.date)} · {labelOf(r.series)}</div></div>) },
            { key: 'kind', label: 'Jenis', render: (r) => labelOf(r.kind) },
            { key: 'program', label: 'Program', render: (r) => r.project?.standard ?? r.project?.name ?? '-' },
            { key: 'client', label: 'Copart', render: (r) => r.client.name },
            { key: 'due', label: 'Jatuh tempo', render: (r) => <span className={isOverdue(r) ? 'text-red' : ''}>{formatDate(r.dueDate)}</span> },
            { key: 'total', label: 'Total', num: true, render: (r) => idr(r.total) },
            { key: 'rest', label: 'Sisa', num: true, render: (r) => (r.status === 'VOID' ? '-' : idr(sisa(r))) },
            { key: 'state', label: 'Penagihan', render: (r) => (r.state ? <Badge value={r.state} /> : '-') },
            { key: 'status', label: 'Status', render: (r) => <Badge value={isOverdue(r) ? 'OVERDUE' : r.status} /> },
          ]} />
      </div>
      <Pager page={page} total={data.total} />

      <Modal open={Boolean(detail)} onClose={() => setDetailId(null)} title={detail ? detail.number : ''} subtitle={detail?.client.name} size="modal-xl">
        {detail && (
          <div className="stack">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Badge value={detail.series} /><Badge value={detail.status} />{isOverdue(detail) && <Badge value="OVERDUE" />}{detail.state && <Badge value={detail.state} />}
              <span className="chip">{labelOf(detail.docType)}</span><span className="chip">{labelOf(detail.kind)}</span>
            </div>
            {detail.status === 'VOID' && <div className="notice">Dibatalkan: {detail.voidReason}</div>}
            <dl className="detail-grid">
              <div><dt>Tanggal</dt><dd>{formatDate(detail.date)}</dd></div>
              <div><dt>Jatuh tempo</dt><dd>{formatDate(detail.dueDate)}</dd></div>
              <div><dt>Kontrak / termin</dt><dd>{detail.project ? `${detail.project.name}${detail.milestone ? ' · ' + detail.milestone.name : ''}` : '-'}</dd></div>
              <div><dt>No. PO / SPK</dt><dd>{detail.reference ?? '-'}</dd></div>
              <div><dt>Attn.</dt><dd>{detail.attn ?? '-'}</dd></div>
              <div><dt>Faktur pajak</dt><dd>{detail.taxInvoiceNo ?? '-'}</dd></div>
              <div><dt>e-Meterai</dt><dd>{detail.meterai ? (detail.meteraiSn ?? 'Belum dibubuhkan') : '-'}</dd></div>
              <div><dt>Dikirim</dt><dd>{detail.sentAt ? `${formatDate(detail.sentAt)} · ${labelOf(detail.sentVia)}${detail.sentNote ? ' · ' + detail.sentNote : ''}` : 'Belum dikirim'}</dd></div>
              <div><dt>Follow up berikutnya</dt><dd>{detail.nextFollowUpAt ? formatDate(detail.nextFollowUpAt) : '-'}</dd></div>
              {detail.internalNote && <div style={{ gridColumn: '1 / -1' }}><dt>Catatan internal</dt><dd>{detail.internalNote}</dd></div>}
            </dl>
            <Card title={detail.subject ?? 'Rincian'} padding={0}>
              <DataTable rows={detail.items} rowKey={(_, i) => i} columns={detail.layout === 'TIKET'
                ? [{ key: 'description', label: 'Penumpang' }, { key: 'route', label: 'Rute', render: (it) => it.route ?? '-' }, { key: 'ref', label: 'Ref.', render: (it) => it.ref ?? '-' }, { key: 'a', label: 'Jumlah', num: true, render: (it) => idr(it.amount) }]
                : [{ key: 'description', label: 'Deskripsi', render: (it) => (<div>{it.description}{it.detail && <div className="muted">{it.detail}</div>}</div>) }, { key: 'a', label: 'Jumlah', num: true, render: (it) => idr(it.amount) }]} />
              <div style={{ padding: 16 }}>
                <div className="totals-box">
                  {detail.taxMode !== 'NONE' && <><div><span>DPP</span><span>{idr(detail.dpp)}</span></div><div><span>PPN ({Number(detail.ppnRate)}%)</span><span>{idr(detail.ppn)}</span></div></>}
                  <div className="grand"><span>Grand total</span><span>{idr(detail.total)}</span></div>
                  <div><span>Diterima</span><span>{idr(detail.paid)}</span></div>
                  <div><span>Sisa</span><strong>{idr(sisa(detail))}</strong></div>
                </div>
              </div>
            </Card>
            <Card title="Follow up" padding={0}>
              <DataTable rows={detail.followUps} empty="Belum ada follow up." columns={[
                { key: 'date', label: 'Tanggal', render: (f) => formatDate(f.date) },
                { key: 'channel', label: 'Melalui', render: (f) => labelOf(f.channel) },
                { key: 'note', label: 'Hasil', render: (f) => (<div>{f.note}{f.promiseDate && <div className="muted">Janji bayar {formatDate(f.promiseDate)}</div>}</div>) },
                { key: 'by', label: 'Oleh', render: (f) => f.creatorName },
              ]} />
            </Card>
            <Card title="Pembayaran" padding={0}>
              <DataTable rows={detail.payments} empty="Belum ada pembayaran." columns={[
                { key: 'date', label: 'Tanggal', render: (p) => formatDate(p.date) },
                { key: 'acc', label: 'Rekening', render: (p) => labelOf(p.account) },
                { key: 'amount', label: 'Diterima', num: true, render: (p) => idr(p.amount) },
                { key: 'pph', label: 'PPh 23', num: true, render: (p) => (Number(p.pph23) ? idr(p.pph23) : '-') },
                { key: 'fee', label: 'Biaya bank', num: true, render: (p) => (Number(p.bankFee) ? idr(p.bankFee) : '-') },
                { key: 'bp', label: 'Bukti potong', render: (p) => p.buktiPotongNo ?? '-' },
                ...(canEdit ? [{ key: 'x', label: '', render: (p) => <button className="btn btn-ghost btn-sm" title="Hapus" onClick={() => deletePayment(p)}><Trash2 size={15} /></button> }] : []),
              ]} />
            </Card>
            <div className="row-actions">
              <Link className="btn btn-outline btn-sm" href={`/invoices/${detail.id}/print`} target="_blank"><Printer size={15} /> Cetak / PDF</Link>
              {canEdit && detail.status !== 'VOID' && (
                <>
                  {detail.payments.length === 0 && <button className="btn btn-danger-outline btn-sm" onClick={() => voidIt(detail)}><Ban size={15} /> Batalkan</button>}
                  {detail.payments.length === 0 && <button className="btn btn-outline btn-sm" onClick={() => { const r = detail; setDetailId(null); openEdit(r); }}><Edit size={15} /> Edit</button>}
                  <button className="btn btn-outline btn-sm" onClick={() => setMtr({ invoiceId: detail.id, number: detail.number, meterai: detail.meterai || meteraiRequired(detail.docType, detail.total), meteraiSn: detail.meteraiSn ?? '' })}><Stamp size={15} /> e-Meterai</button>
                  {detail.status !== 'PAID' && <button className="btn btn-outline btn-sm" onClick={() => setSend({ invoiceId: detail.id, sentAt: iso(detail.sentAt) ?? todayIso(), sentVia: detail.sentVia ?? 'EKSPEDISI', sentNote: detail.sentNote ?? '' })}><Send size={15} /> {detail.sentAt ? 'Ubah pengiriman' : 'Tandai terkirim'}</button>}
                  {detail.status !== 'PAID' && detail.sentAt && <button className="btn btn-outline btn-sm" onClick={() => setFu({ invoiceId: detail.id, date: todayIso(), channel: 'TELEPON', note: '', promiseDate: '' })}><PhoneCall size={15} /> Catat follow up</button>}
                  {detail.status !== 'PAID' && <button className="btn btn-primary btn-sm" onClick={() => setPay({ invoiceId: detail.id, number: detail.number, date: todayIso(), account: detail.series, amount: sisa(detail), pph23: '', bankFee: '', buktiPotongNo: '', notes: '' })}><HandCoins size={15} /> Terima pembayaran</button>}
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(mtr)} onClose={() => setMtr(null)} title="e-Meterai" subtitle={mtr?.number}>
        {mtr && (
          <form onSubmit={saveMeterai}>
            <FormFields values={mtr} setValues={setMtr} fields={[
              { name: 'meterai', label: 'Pakai e-Meterai', type: 'checkbox', span: true },
              { name: 'meteraiSn', label: 'No. seri e-Meterai', span: true, hidden: (v) => !v.meterai, placeholder: 'Diisi setelah dibubuhkan di portal e-Meterai' },
            ]} />
            <div className="modal-footer" style={{ padding: '16px 0 0' }}><button type="button" className="btn btn-ghost" onClick={() => setMtr(null)}>Batal</button><button className="btn btn-primary" disabled={busy}>Simpan</button></div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(send)} onClose={() => setSend(null)} title="Pengiriman invoice">
        {send && (
          <form onSubmit={saveSend}>
            <FormFields values={send} setValues={setSend} fields={[
              { name: 'sentAt', label: 'Tanggal kirim', type: 'date', required: true },
              { name: 'sentVia', label: 'Dikirim via', type: 'select', options: ['EKSPEDISI', 'EMAIL', 'WHATSAPP', 'LANGSUNG'], noEmpty: true },
              { name: 'sentNote', label: 'No. resi / keterangan', span: true },
            ]} />
            <div className="modal-footer" style={{ padding: '16px 0 0' }}><button type="button" className="btn btn-ghost" onClick={() => setSend(null)}>Batal</button><button className="btn btn-primary" disabled={busy}>Simpan</button></div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(fu)} onClose={() => setFu(null)} title="Catat follow up">
        {fu && (
          <form onSubmit={saveFu}>
            <FormFields values={fu} setValues={setFu} fields={[
              { name: 'date', label: 'Tanggal', type: 'date', required: true },
              { name: 'channel', label: 'Melalui', type: 'select', options: ['TELEPON', 'EMAIL', 'WHATSAPP', 'KUNJUNGAN'], noEmpty: true },
              { name: 'note', label: 'Hasil follow up', type: 'textarea', required: true, span: true },
              { name: 'promiseDate', label: 'Janji bayar (opsional)', type: 'date' },
            ]} />
            <div className="modal-footer" style={{ padding: '16px 0 0' }}><button type="button" className="btn btn-ghost" onClick={() => setFu(null)}>Batal</button><button className="btn btn-primary" disabled={busy}>Simpan</button></div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(pay)} onClose={() => setPay(null)} title={`Pembayaran ${pay?.number ?? ''}`}>
        {pay && (
          <form onSubmit={savePay}>
            <FormFields values={pay} setValues={setPay} fields={[
              { name: 'date', label: 'Tanggal terima', type: 'date', required: true },
              { name: 'account', label: 'Masuk ke rekening', type: 'select', options: [['TQ', `ON — ${banks.TQ}`], ['OPS', `OFF — ${banks.OPS}`]], noEmpty: true },
              { name: 'amount', label: 'Dana diterima', type: 'number', min: 0, step: 'any', required: true },
              { name: 'pph23', label: 'PPh 23 dipotong Copart', type: 'number', min: 0, step: 'any' },
              { name: 'buktiPotongNo', label: 'No. bukti potong' },
              { name: 'bankFee', label: 'Biaya transfer', type: 'number', min: 0, step: 'any' },
              { name: 'notes', label: 'Catatan', span: true },
            ]} />
            <div className="muted">Total pelunasan {idr(num(pay.amount) + num(pay.pph23) + num(pay.bankFee))}</div>
            <div className="modal-footer" style={{ padding: '16px 0 0' }}><button type="button" className="btn btn-ghost" onClick={() => setPay(null)}>Batal</button><button className="btn btn-primary" disabled={busy}>Simpan</button></div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? `Edit ${form.number}` : 'Buat invoice'} size="modal-xl">
        {form && (
          <form onSubmit={save} className="stack">
            <SeriesPicker value={form.series} disabled={Boolean(form.id)} onChange={(v) => setForm({ ...form, series: v })} />
            <FormFields values={form} setValues={setValues} columns={3} fields={[
              { name: 'clientId', label: 'Copart', type: 'select', options: clients.map((c) => [c.id, c.name]), required: true },
              { name: 'kind', label: 'Jenis', type: 'select', options: KINDS, noEmpty: true },
              { name: 'docType', label: 'Perihal', type: 'select', options: ['INVOICE', 'KWITANSI'], noEmpty: true },
              { name: 'projectId', label: 'Kontrak', type: 'select', options: clientProjects.map((p) => [p.id, p.standard ?? p.name]) },
              ...(form.id ? [] : [{ name: 'milestoneId', label: 'Termin', type: 'select', options: milestones.map((m) => [m.id, `${m.name} · ${idr(m.amount)}`]), hidden: (v) => !v.projectId }]),
              { name: 'attn', label: 'Attn.' },
              { name: 'date', label: 'Tanggal', type: 'date', required: true },
              { name: 'dueDate', label: 'Jatuh tempo', type: 'date', required: true },
              { name: 'reference', label: 'No. PO / SPK' },
              { name: 'layout', label: 'Format rincian', type: 'select', options: ['JASA', 'TIKET'], noEmpty: true },
              { name: 'subject', label: 'Judul rincian', placeholder: 'mis. Biaya Transportasi — Audit' },
              { name: 'taxInvoiceNo', label: 'No. faktur pajak', hidden: (v) => v.series !== 'TQ' },
              { name: 'meterai', label: 'Pakai e-Meterai', type: 'checkbox' },
              ...(form.id ? [] : [{ name: 'seq', label: 'Nomor urut (kosongkan = otomatis)', type: 'number', min: 1 }]),
            ]} />
            <ItemsEditor items={items} setItems={setItems} layout={form.layout} />
            <div className="grid-2" style={{ alignItems: 'start' }}>
              <div className="stack" style={{ gap: 12 }}>
                <div className="form-group"><label className="form-label">Catatan pada dokumen</label><textarea className="form-input" rows={2} value={form.notes} placeholder={form.docType === 'KWITANSI' ? doc.kwitansiNote : doc.invoiceNote} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">Catatan internal</label><textarea className="form-input" rows={2} value={form.internalNote} onChange={(e) => setForm({ ...form, internalNote: e.target.value })} /></div>
                <div className="muted">Rekening: {banks[form.series]}</div>
                {!form.meterai && meteraiRequired(form.docType, items.reduce((t, it) => t + num(it.amount), 0)) && <div className="muted">Kwitansi ≥ Rp5.000.000 wajib bermeterai.</div>}
              </div>
              <TotalsBox items={items} series={form.series} taxMode={taxMode} setTaxMode={setTaxMode} ppnRate={doc.ppnRate} />
            </div>
            <div className="modal-footer" style={{ padding: 0 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Batal</button>
              <button className="btn btn-primary" disabled={busy}>{form.id ? 'Simpan perubahan' : 'Simpan'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
