// Aturan akuntansi murni (tanpa database) agar dapat diuji: pembulatan, keseimbangan
// jurnal, perhitungan dokumen + pajak dinamis, umur piutang, dan penyusutan garis lurus.

export const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'COST', 'EXPENSE', 'OTHER_INCOME', 'OTHER_EXPENSE', 'INCOME_TAX'];
export const BALANCE_TYPES = ['ASSET', 'LIABILITY', 'EQUITY'];
export const PL_TYPES = ['REVENUE', 'COST', 'EXPENSE', 'OTHER_INCOME', 'OTHER_EXPENSE', 'INCOME_TAX'];
export const NORMAL_BALANCE = { ASSET: 'DEBIT', LIABILITY: 'CREDIT', EQUITY: 'CREDIT', REVENUE: 'CREDIT', COST: 'DEBIT', EXPENSE: 'DEBIT', OTHER_INCOME: 'CREDIT', OTHER_EXPENSE: 'DEBIT', INCOME_TAX: 'DEBIT' };

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const EPS = 0.005;

/** Saldo menurut saldo normal akun (positif = sesuai saldo normal). */
export const signed = (normalBalance, debit, credit) => (normalBalance === 'CREDIT' ? Number(credit) - Number(debit) : Number(debit) - Number(credit));

/**
 * Validasi baris jurnal: minimal dua baris, tiap baris hanya debit ATAU kredit (> 0), total seimbang.
 * Mengembalikan baris yang sudah dibulatkan + total.
 */
export function balanceLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) throw new Error('Jurnal minimal dua baris.');
  const clean = lines.map((l, i) => {
    const debit = round2(l.debit || 0), credit = round2(l.credit || 0);
    if (!l.accountId) throw new Error(`Baris ${i + 1}: akun wajib dipilih.`);
    if (debit < 0 || credit < 0) throw new Error(`Baris ${i + 1}: nominal tidak boleh negatif.`);
    if ((debit > 0) === (credit > 0)) throw new Error(`Baris ${i + 1}: isi debit atau kredit (salah satu).`);
    return { ...l, debit, credit };
  });
  const totalDebit = round2(clean.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(clean.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(totalDebit - totalCredit) > EPS) throw new Error(`Jurnal tidak seimbang: debit ${totalDebit} ≠ kredit ${totalCredit}.`);
  return { lines: clean, totalDebit, totalCredit };
}

/** Gabungkan baris dengan akun/proyek/sisi yang sama agar jurnal otomatis ringkas. */
export function mergeLines(lines) {
  const map = new Map();
  for (const l of lines) {
    if (!(l.debit > 0) && !(l.credit > 0)) continue;
    const side = l.debit > 0 ? 'D' : 'C';
    const key = [l.accountId, l.projectId ?? '', side, l.description ?? ''].join('|');
    const cur = map.get(key);
    if (cur) { cur.debit = round2(cur.debit + (l.debit || 0)); cur.credit = round2(cur.credit + (l.credit || 0)); }
    else map.set(key, { ...l, debit: round2(l.debit || 0), credit: round2(l.credit || 0) });
  }
  return [...map.values()];
}

/**
 * Hitung dokumen penjualan/pembelian.
 * items: [{quantity, unitPrice}] → total baris. taxes: [{rate, type}] dihitung dari DPP = subtotal − diskon.
 */
export function computeDocument({ items, discount = 0, taxes = [] }) {
  const lines = items.map((it) => ({ ...it, total: round2(Number(it.quantity) * Number(it.unitPrice)) }));
  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
  const disc = round2(discount || 0);
  if (disc < 0 || disc > subtotal) throw new Error('Diskon tidak boleh melebihi subtotal.');
  const base = round2(subtotal - disc);
  const applied = taxes.map((t) => ({ ...t, amount: Math.round(base * Number(t.rate) / 100) }));
  const taxAdd = applied.filter((t) => t.type === 'ADDITION').reduce((s, t) => s + t.amount, 0);
  const taxDeduct = applied.filter((t) => t.type === 'DEDUCTION').reduce((s, t) => s + t.amount, 0);
  return { items: lines, subtotal, discount: disc, base, appliedTaxes: applied, taxAdd, taxDeduct, total: round2(base + taxAdd - taxDeduct) };
}

export function paymentStatus(total, paid) {
  if (paid <= EPS) return 'UNPAID';
  return Number(total) - Number(paid) <= EPS ? 'PAID' : 'PARTIAL';
}

export const AGING_BUCKETS = [
  ['current', 'Belum jatuh tempo'],
  ['d30', '1–30 hari'],
  ['d60', '31–60 hari'],
  ['d90', '61–90 hari'],
  ['over90', '> 90 hari'],
];

export function agingBucket(dueDate, asOf) {
  const days = Math.floor((new Date(asOf).getTime() - new Date(dueDate).getTime()) / 86400000);
  if (days <= 0) return 'current';
  if (days <= 30) return 'd30';
  if (days <= 60) return 'd60';
  if (days <= 90) return 'd90';
  return 'over90';
}

const monthIndex = (key) => { const [y, m] = key.split('-').map(Number); return y * 12 + (m - 1); };
export const monthOf = (d) => new Date(d).toISOString().slice(0, 7);

/**
 * Penyusutan garis lurus bulanan. Bulan perolehan dihitung penuh bila diperoleh
 * tanggal 1–15, selain itu penyusutan mulai bulan berikutnya.
 * Mengembalikan nominal untuk `period` (YYYY-MM) dengan memperhitungkan akumulasi sebelumnya.
 */
export function depreciationFor(asset, period, accumulated = 0) {
  const cost = Number(asset.cost), residual = Number(asset.residualValue || 0), life = Number(asset.usefulLifeMonths);
  const base = round2(cost - residual);
  if (base <= 0 || life <= 0) return 0;
  const acq = new Date(asset.acquisitionDate);
  const startKey = monthOf(acq);
  const start = monthIndex(startKey) + (acq.getUTCDate() > 15 ? 1 : 0);
  const idx = monthIndex(period) - start;
  if (idx < 0 || idx >= life) return 0;
  const remaining = round2(base - accumulated);
  if (remaining <= 0) return 0;
  // Bulan terakhir menutup selisih pembulatan.
  if (idx === life - 1) return remaining;
  return Math.min(remaining, Math.round(base / life));
}

/** Kelompok arus kas dari akun lawan transaksi kas. */
export function cashFlowActivity(account) {
  if (account.type === 'EQUITY') return 'FINANCING';
  if (account.type === 'LIABILITY' && account.code.startsWith('22')) return 'FINANCING';
  if (account.type === 'ASSET' && (account.code.startsWith('12') || account.code.startsWith('13'))) return 'INVESTING';
  return 'OPERATING';
}

/** Terbilang rupiah untuk invoice ("satu juta dua ratus ribu rupiah"). */
export function terbilang(n) {
  const satuan = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  const f = (x) => {
    x = Math.floor(x);
    if (x < 12) return satuan[x];
    if (x < 20) return f(x - 10) + ' belas';
    if (x < 100) return f(x / 10) + ' puluh' + (x % 10 ? ' ' + f(x % 10) : '');
    if (x < 200) return 'seratus' + (x - 100 ? ' ' + f(x - 100) : '');
    if (x < 1000) return f(x / 100) + ' ratus' + (x % 100 ? ' ' + f(x % 100) : '');
    if (x < 2000) return 'seribu' + (x - 1000 ? ' ' + f(x - 1000) : '');
    if (x < 1e6) return f(x / 1000) + ' ribu' + (x % 1000 ? ' ' + f(x % 1000) : '');
    if (x < 1e9) return f(x / 1e6) + ' juta' + (x % 1e6 ? ' ' + f(x % 1e6) : '');
    if (x < 1e12) return f(x / 1e9) + ' miliar' + (x % 1e9 ? ' ' + f(x % 1e9) : '');
    return f(x / 1e12) + ' triliun' + (x % 1e12 ? ' ' + f(x % 1e12) : '');
  };
  const v = Math.round(Number(n) || 0);
  if (v === 0) return 'nol rupiah';
  return (f(v).replace(/\s+/g, ' ').trim() + ' rupiah');
}
