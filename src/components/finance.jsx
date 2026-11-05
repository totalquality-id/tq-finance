'use client';

// Komponen form invoice: editor rincian (format Jasa / Tiket) dan ringkasan total.
import { Plus, Trash2 } from 'lucide-react';
import { computeInvoice } from '@/lib/domain/billing';
import { idr } from '@/lib/labels';

export const num = (v) => (v === '' || v === null || v === undefined ? 0 : Number(v) || 0);
export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const blankItem = () => ({ description: '', detail: '', route: '', ref: '', amount: '' });

export function ItemsEditor({ items, setItems, layout }) {
  const upd = (i, k, v) => setItems(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const tiket = layout === 'TIKET';
  return (
    <div className="lines-wrap">
      <table className="lines">
        <thead>
          <tr>
            <th style={{ minWidth: 220 }}>{tiket ? 'Penumpang' : 'Deskripsi'}</th>
            {tiket ? <><th style={{ width: 170 }}>Rute</th><th style={{ width: 140 }}>Ref. number</th></> : <th style={{ minWidth: 200 }}>Keterangan</th>}
            <th style={{ width: 170 }} className="num">Jumlah (Rp)</th>
            <th style={{ width: 44 }} />
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td><input className="form-input" required value={it.description} onChange={(e) => upd(i, 'description', e.target.value)} placeholder={tiket ? 'Nama penumpang' : 'mis. Jasa Quality Management System — Termin 1/6'} /></td>
              {tiket ? (
                <>
                  <td><input className="form-input" value={it.route ?? ''} onChange={(e) => upd(i, 'route', e.target.value)} placeholder="SUB – CGK" /></td>
                  <td><input className="form-input" value={it.ref ?? ''} onChange={(e) => upd(i, 'ref', e.target.value)} /></td>
                </>
              ) : (
                <td><input className="form-input" value={it.detail ?? ''} onChange={(e) => upd(i, 'detail', e.target.value)} placeholder="Baris kedua (opsional)" /></td>
              )}
              <td className="num"><input className="form-input" type="number" step="any" min="0" required value={it.amount} onChange={(e) => upd(i, 'amount', e.target.value)} /></td>
              <td>{items.length > 1 && <button type="button" className="btn btn-ghost btn-sm" title="Hapus baris" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={15} /></button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setItems([...items, blankItem()])}><Plus size={15} /> Tambah baris</button>
    </div>
  );
}

export function invoiceTotals(items, series, taxMode, ppnRate) {
  return computeInvoice({ items: items.map((it) => ({ amount: num(it.amount) })), series, taxMode, ppnRate });
}

export function TotalsBox({ items, series, taxMode, setTaxMode, ppnRate }) {
  const t = invoiceTotals(items, series, taxMode, ppnRate);
  return (
    <div className="totals-box">
      {series === 'TQ' && (
        <div style={{ alignItems: 'center' }}>
          <span>PPN</span>
          <select className="form-select" style={{ width: 210 }} value={taxMode} onChange={(e) => setTaxMode(e.target.value)}>
            <option value="PPN_INCLUDED">Nilai sudah termasuk PPN</option>
            <option value="PPN_EXCLUDED">PPN ditambahkan</option>
            <option value="NONE">Tanpa PPN</option>
          </select>
        </div>
      )}
      <div><span>Jumlah</span><span>{idr(t.subtotal)}</span></div>
      {t.taxMode !== 'NONE' && (
        <>
          <div><span>DPP</span><span>{idr(t.dpp)}</span></div>
          <div><span>PPN ({t.ppnRate}%)</span><span>{idr(t.ppn)}</span></div>
        </>
      )}
      <div className="grand"><span>Grand total</span><span>{idr(t.total)}</span></div>
    </div>
  );
}
