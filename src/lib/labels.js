// Label tampilan & warna badge untuk seluruh kode status (dipakai client & server).
export const LABELS = {
  // invoice
  UNPAID: 'Belum dibayar', PARTIAL: 'Dibayar sebagian', PAID: 'Lunas', VOID: 'Dibatalkan', OVERDUE: 'Jatuh tempo',
  TQ: 'ON', OPS: 'OFF',
  TAHAP_DP: 'Tahap DP', TERMIN: 'Termin', PELUNASAN: 'Pelunasan', ADD_COST: 'Add Cost', TRANSPORTASI: 'Transportasi', KONSUMSI: 'Konsumsi',
  INVOICE: 'Invoice', KWITANSI: 'Kwitansi',
  KONTRAK: 'Kontrak', AKOMODASI: 'Akomodasi', LAINNYA: 'Lainnya',
  JASA: 'Jasa', TIKET: 'Tiket / transportasi',
  NONE: 'Tanpa PPN', PPN_INCLUDED: 'Termasuk PPN', PPN_EXCLUDED: 'Belum termasuk PPN',
  EKSPEDISI: 'Ekspedisi', EMAIL: 'Email', WHATSAPP: 'WhatsApp', LANGSUNG: 'Diantar langsung',
  TELEPON: 'Telepon', KUNJUNGAN: 'Kunjungan',
  NOT_SENT: 'Belum dikirim', SENT: 'Terkirim', FOLLOW_UP: 'Perlu follow up',
  // kontrak
  MENUNGGU_DP: 'Menunggu DP', AKTIF: 'Berjalan', DITAHAN: 'Ditunda', SELESAI: 'Close', BATAL: 'Batal', NONAKTIF: 'Nonaktif',
  SYSTEM: 'System', PROJECT: 'Project', TRAINING: 'Training', AUDIT: 'Audit',
  PLANNED: 'Belum ditagih', INVOICED: 'Sudah diinvoice',
  CCD: 'CCD', SDD: 'SDD', BSD: 'BSD', HRD: 'HRD', CSD: 'CSD - WE',
  // kontak
  CLIENT: 'Copart',
  // peran
  MANAJER_KEUANGAN: 'Manajer Keuangan', STAF_KEUANGAN: 'Staf Keuangan', PIMPINAN: 'Pimpinan / Direksi',
};

export const labelOf = (v) => LABELS[v] ?? v;

const green = 'badge-success', yellow = 'badge-warning', red = 'badge-danger', blue = 'badge-info', navy = 'badge-navy', orange = 'badge-orange', gray = 'badge-gray';
export const STATUS_STYLES = {
  UNPAID: yellow, PARTIAL: blue, PAID: green, VOID: gray, OVERDUE: red,
  TQ: navy, OPS: gray, KONTRAK: navy, AKOMODASI: orange, LAINNYA: gray,
  TAHAP_DP: navy, TERMIN: navy, PELUNASAN: navy, AUDIT: blue, ADD_COST: blue, TRANSPORTASI: orange, KONSUMSI: orange,
  NOT_SENT: gray, SENT: blue, FOLLOW_UP: orange,
  MENUNGGU_DP: yellow, AKTIF: green, DITAHAN: yellow, SELESAI: navy, BATAL: gray, NONAKTIF: gray,
  PLANNED: gray, INVOICED: blue,
};

export const idr = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v ?? 0));
export const fmtNum = (v, d = 0) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: d }).format(Number(v ?? 0));
// Angka tabel: negatif dalam kurung, nol sebagai tanda pisah.
export const acc = (v) => {
  const n = Math.round(Number(v ?? 0));
  if (n === 0) return '-';
  const s = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.abs(n));
  return n < 0 ? `(${s})` : s;
};
