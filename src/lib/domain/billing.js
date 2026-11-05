// Aturan penagihan murni (tanpa database) agar dapat diuji: penomoran, perhitungan
// DPP/PPN per seri, status pembayaran, umur piutang, jadwal follow up, terbilang.

export const SERIES = ['TQ', 'OPS'];
export const DOC_TYPES = ['INVOICE', 'KWITANSI'];
export const CATEGORIES = ['KONTRAK', 'AKOMODASI', 'LAINNYA'];
export const LAYOUTS = ['JASA', 'TIKET'];
export const TAX_MODES = ['NONE', 'PPN_INCLUDED', 'PPN_EXCLUDED'];
export const SEND_CHANNELS = ['EKSPEDISI', 'EMAIL', 'WHATSAPP', 'LANGSUNG'];
export const FOLLOW_UP_CHANNELS = ['TELEPON', 'EMAIL', 'WHATSAPP', 'KUNJUNGAN'];
export const DEPARTMENTS = ['CCD', 'BSD', 'SDO', 'HRD', 'CSD'];
// Batas nilai dokumen yang wajib bermeterai (UU 10/2020): Rp5.000.000.
export const METERAI_THRESHOLD = 5_000_000;

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const EPS = 0.005;

/** Singkatan Copart untuk nomor invoice: huruf/angka kapital 2–6 karakter. */
export function normalizeShortCode(value) {
  const s = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length >= 2 && s.length <= 6 ? s : null;
}

/** Usulan singkatan dari nama: "PT Dwi Bintang Global" → "DBG". */
export function suggestShortCode(name) {
  const words = String(name ?? '').toUpperCase().replace(/\b(PT|CV|TBK|UD|PD|KOPERASI)\b\.?/g, ' ').replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return 'COP';
  if (words.length === 1) return words[0].slice(0, 3).padEnd(3, 'X');
  return words.slice(0, 3).map((w) => w[0]).join('');
}

/** Nomor baku TQ: INV-{COP}/{NO}/{MM}/{YY}, mis. INV-ELD/1247/09/26. */
export function formatInvoiceNumber(shortCode, seq, date) {
  const d = new Date(date);
  return `INV-${shortCode}/${seq}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCFullYear()).slice(2)}`;
}

/**
 * Hitung invoice. Seri OPS selalu tanpa PPN.
 * PPN_INCLUDED: jumlah rincian sudah termasuk PPN → DPP = jumlah × 100/(100+tarif).
 * PPN_EXCLUDED: PPN ditambahkan di atas jumlah rincian.
 */
export function computeInvoice({ items, series, taxMode, ppnRate = 11 }) {
  const lines = items.map((it) => ({ ...it, amount: round2(it.amount) }));
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const mode = series === 'OPS' ? 'NONE' : taxMode;
  const rate = Number(ppnRate);
  let dpp = subtotal, ppn = 0, total = subtotal;
  if (mode === 'PPN_INCLUDED') {
    dpp = Math.round((subtotal * 100) / (100 + rate));
    ppn = round2(subtotal - dpp);
  } else if (mode === 'PPN_EXCLUDED') {
    ppn = Math.round((subtotal * rate) / 100);
    total = round2(subtotal + ppn);
  }
  return { items: lines, subtotal, dpp, ppn, total, taxMode: mode, ppnRate: rate };
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

/**
 * Tanggal follow up berikutnya untuk invoice terbuka (SOP: 2–3 hari setelah kirim).
 * Dasar: follow up terakhir, atau tanggal kirim bila belum pernah. Null bila belum dikirim.
 */
export function nextFollowUp({ sentAt, lastFollowUp, promiseDate }, days = 3) {
  const base = lastFollowUp ?? sentAt;
  if (!base) return null;
  const next = new Date(new Date(base).getTime() + days * 86400000);
  if (promiseDate && new Date(promiseDate) > next) return new Date(promiseDate);
  return next;
}

/** Terbilang rupiah ("satu juta dua ratus ribu rupiah"). */
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
  return f(v).replace(/\s+/g, ' ').trim() + ' rupiah';
}
