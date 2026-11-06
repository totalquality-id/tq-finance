import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/page';
import { getSettings, invoiceAssets } from '@/lib/settings';
import { getInvoice } from '@/lib/services/invoices';
import { terbilang } from '@/lib/domain/billing';
import { formatDate } from '@/lib/dates';
import { idr } from '@/lib/labels';
import PrintToolbar from './PrintToolbar';

export const metadata = { title: 'Cetak invoice' };

const long = { day: 'numeric', month: 'long', year: 'numeric' };
const rp = (v) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(v ?? 0));

export default async function PrintInvoicePage({ params }) {
  await requirePage('/invoices');
  const { id } = await params;
  const inv = await getInvoice(id).catch(() => null);
  if (!inv) notFound();
  const [settings, assets] = await Promise.all([getSettings(['company.profile', 'invoice.document', 'invoice.seriesTQ', 'invoice.seriesOPS']), invoiceAssets()]);
  const company = settings['company.profile'];
  const doc = settings['invoice.document'];
  const bank = settings[inv.series === 'TQ' ? 'invoice.seriesTQ' : 'invoice.seriesOPS'];
  const tq = inv.series === 'TQ';
  const kwitansi = inv.docType === 'KWITANSI';
  const title = kwitansi ? 'KWITANSI' : 'INVOICE';
  const tiket = inv.layout === 'TIKET';
  const meterai = inv.meterai;
  const note = inv.notes || (kwitansi ? doc.kwitansiNote : doc.invoiceNote);

  return (
    <div className="print-root">
      <PrintToolbar number={inv.number} voided={inv.status === 'VOID'} meterai={meterai && !inv.meteraiSn} />
      <article className={`sheet ${tq ? 'sheet-tq' : 'sheet-ops'}`}>
        {inv.status === 'VOID' && <div className="sheet-void">DIBATALKAN</div>}
        {tq ? (
          <header className="kop">
            <img src="/brand/tq-logo-full.png" alt="Total Quality" className="kop-logo" />
            <div className="kop-company">
              <strong>{company.name}</strong>
              <div>{company.address}</div>
              <div>{[company.phone, company.email].filter(Boolean).join(' · ')}</div>
              {company.npwp && <div>NPWP {company.npwp}</div>}
            </div>
          </header>
        ) : null}

        <h1 className="sheet-title">{title}</h1>

        <section className="sheet-parties">
          <div>
            <div className="lbl">Kepada</div>
            <strong>{inv.client.name}</strong>
            {inv.client.address && <div className="pre">{inv.client.address}{inv.client.city && !inv.client.address.includes(inv.client.city) ? ', ' + inv.client.city : ''}</div>}
            {inv.attn && <div className="attn">Attn. {inv.attn}</div>}
          </div>
          <table className="meta">
            <tbody>
              <tr><td>Nomor</td><td>{inv.number}</td></tr>
              <tr><td>Tanggal</td><td>{formatDate(inv.date, long)}</td></tr>
              {!kwitansi && <tr><td>Jatuh tempo</td><td>{formatDate(inv.dueDate, long)}</td></tr>}
              {inv.reference && <tr><td>No. PO / SPK</td><td>{inv.reference}</td></tr>}
              {tq && <tr><td>Perihal</td><td>{kwitansi ? 'Kwitansi' : 'Invoice'}</td></tr>}
            </tbody>
          </table>
        </section>

        <table className="sheet-items">
          <thead>
            {tiket
              ? <tr><th>Penumpang</th><th>Rute</th><th>Ref. Number</th><th className="r">Jumlah (Rp)</th></tr>
              : <tr><th>Deskripsi</th><th className="r">Jumlah (Rp)</th></tr>}
          </thead>
          <tbody>
            {inv.subject && <tr className="subject"><td colSpan={tiket ? 4 : 2}>{inv.subject}</td></tr>}
            {inv.items.map((it, i) => (tiket
              ? <tr key={i}><td>{it.description}</td><td>{it.route}</td><td>{it.ref}</td><td className="r">{rp(it.amount)}</td></tr>
              : <tr key={i}><td>{it.description}{it.detail && <div className="detail">{it.detail}</div>}</td><td className="r">{rp(it.amount)}</td></tr>))}
          </tbody>
        </table>

        <section className="sheet-totals">
          {inv.taxMode !== 'NONE' ? (
            <>
              <div><span>DPP</span><span>{rp(inv.dpp)}</span></div>
              <div><span>PPN ({Number(inv.ppnRate)}%)</span><span>{rp(inv.ppn)}</span></div>
            </>
          ) : (
            <div><span>Total</span><span>{rp(inv.subtotal)}</span></div>
          )}
          <div className="grand"><span>Grand Total</span><span>{idr(inv.total)}</span></div>
        </section>
        <p className="terbilang">Terbilang: <em>{terbilang(inv.total)}</em></p>

        <section className="sheet-bottom">
          <div className="bank">
            <div className="lbl">Pembayaran dapat dilakukan melalui transfer ke rekening</div>
            <div>{bank.bankName || '—'}</div>
            <div className="acct">No. {bank.bankAccount || '—'}</div>
            <div>{bank.bankHolder}</div>
            {tq && inv.taxInvoiceNo && <div className="faktur">No. faktur pajak: {inv.taxInvoiceNo}</div>}
          </div>
          <div className="sign">
            <div>{company.city ? company.city + ', ' : ''}{formatDate(inv.date, long)}</div>
            <div className="sign-area">
              {meterai && <div className="meterai">e-Meterai</div>}
              {tq && assets.stamp && <img src={assets.stamp} alt="" className="stamp" />}
              {assets.signature && <img src={assets.signature} alt="" className="signature" />}
            </div>
            <strong className="signer">{doc.signerName || ' '}</strong>
            <div>{doc.signerTitle}</div>
          </div>
        </section>

        <p className="sheet-note">Catatan: {note}</p>

        {tq && (
          <footer className="kop-footer">
            <img src="/brand/kop-footer.png" alt={company.website} />
          </footer>
        )}
      </article>
    </div>
  );
}
