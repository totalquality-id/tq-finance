'use client';

// Komponen khusus keuangan: input nominal, pilihan akun, editor baris dokumen.
import { Plus, Trash2 } from 'lucide-react';
import { idr } from '@/lib/labels';

export const num = (v) => (v === '' || v === null || v === undefined ? 0 : Number(v) || 0);
export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function AccountSelect({ accounts, value, onChange, required, placeholder = '— Pilih akun —', filter, id, disabled }) {
  const list = filter ? accounts.filter(filter) : accounts;
  return (
    <select id={id} className="form-select" value={value ?? ''} required={required} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {list.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
    </select>
  );
}

/** Editor rincian item invoice/tagihan. withAccount = baris tagihan dibebankan ke akun. */
export function ItemsEditor({ items, setItems, accounts, withAccount = false, disabled }) {
  const upd = (i, k, v) => setItems(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const blank = withAccount ? { description: '', accountId: '', quantity: 1, unit: 'paket', unitPrice: '' } : { description: '', quantity: 1, unit: 'paket', unitPrice: '' };
  return (
    <div className="lines-wrap">
      <table className="lines">
        <thead>
          <tr>
            <th style={{ minWidth: 220 }}>Uraian</th>
            {withAccount && <th style={{ minWidth: 220 }}>Akun beban / aset</th>}
            <th style={{ width: 90 }}>Qty</th>
            <th style={{ width: 100 }}>Satuan</th>
            <th style={{ width: 160 }} className="num">Harga satuan</th>
            <th style={{ width: 150 }} className="num">Jumlah</th>
            <th style={{ width: 44 }} />
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td><input className="form-input" required value={it.description} disabled={disabled} onChange={(e) => upd(i, 'description', e.target.value)} placeholder="mis. Jasa konsultansi ISO 9001:2015 — termin 1" /></td>
              {withAccount && <td><AccountSelect accounts={accounts} value={it.accountId} required disabled={disabled} onChange={(v) => upd(i, 'accountId', v)} /></td>}
              <td><input className="form-input" type="number" step="any" min="0" required value={it.quantity} disabled={disabled} onChange={(e) => upd(i, 'quantity', e.target.value)} /></td>
              <td><input className="form-input" value={it.unit ?? ''} disabled={disabled} onChange={(e) => upd(i, 'unit', e.target.value)} /></td>
              <td className="num"><input className="form-input" type="number" step="any" min="0" required value={it.unitPrice} disabled={disabled} onChange={(e) => upd(i, 'unitPrice', e.target.value)} /></td>
              <td className="num" style={{ paddingTop: 12 }}>{idr(r2(num(it.quantity) * num(it.unitPrice)))}</td>
              <td>{items.length > 1 && !disabled && <button type="button" className="btn btn-ghost btn-sm" title="Hapus baris" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={15} /></button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!disabled && <button type="button" className="btn btn-outline btn-sm" onClick={() => setItems([...items, { ...blank }])}><Plus size={15} /> Tambah baris</button>}
    </div>
  );
}

/** Hitung total dokumen di browser (sama dengan computeDocument di server). */
export function docTotals(items, discount, taxes) {
  const subtotal = r2(items.reduce((s, it) => s + r2(num(it.quantity) * num(it.unitPrice)), 0));
  const base = r2(subtotal - num(discount));
  const applied = taxes.map((t) => ({ ...t, amount: Math.round((base * Number(t.rate)) / 100) }));
  const add = applied.filter((t) => t.type === 'ADDITION').reduce((s, t) => s + t.amount, 0);
  const deduct = applied.filter((t) => t.type === 'DEDUCTION').reduce((s, t) => s + t.amount, 0);
  return { subtotal, base, applied, add, deduct, total: r2(base + add - deduct) };
}

/** Kotak total + centang pajak dinamis. */
export function TotalsBox({ items, discount, setDiscount, taxes, taxIds, setTaxIds, showDiscount = true, totalLabel = 'Total tagihan' }) {
  const chosen = taxes.filter((t) => taxIds.includes(t.id));
  const t = docTotals(items, showDiscount ? discount : 0, chosen);
  return (
    <div className="totals-box">
      <div><span>Subtotal</span><strong>{idr(t.subtotal)}</strong></div>
      {showDiscount && (
        <div style={{ alignItems: 'center' }}>
          <span>Diskon</span>
          <input className="form-input" type="number" min="0" step="any" style={{ width: 160, textAlign: 'right' }} value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </div>
      )}
      {taxes.length > 0 && <div className="muted" style={{ marginTop: 4 }}>Pajak (dasar {idr(t.base)})</div>}
      {taxes.map((tx) => {
        const on = taxIds.includes(tx.id);
        const amt = t.applied.find((a) => a.id === tx.id)?.amount ?? 0;
        return (
          <div key={tx.id}>
            <label className="tax-check">
              <input type="checkbox" checked={on} onChange={(e) => setTaxIds(e.target.checked ? [...taxIds, tx.id] : taxIds.filter((x) => x !== tx.id))} />
              {tx.name} ({Number(tx.rate)}%)
            </label>
            <span className={tx.type === 'DEDUCTION' ? 'amount-out' : ''}>{on ? (tx.type === 'DEDUCTION' ? '− ' : '+ ') + idr(amt) : '-'}</span>
          </div>
        );
      })}
      <div className="grand"><span>{totalLabel}</span><span>{idr(t.total)}</span></div>
    </div>
  );
}
