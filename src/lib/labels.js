// Label tampilan & warna badge untuk seluruh kode status (dipakai client & server).
export const LABELS = {
  // dokumen piutang/hutang
  UNPAID: 'Belum dibayar', PARTIAL: 'Dibayar sebagian', PAID: 'Lunas', VOID: 'Dibatalkan', OVERDUE: 'Jatuh tempo',
  // proyek
  AKTIF: 'Aktif', DITAHAN: 'Ditahan', SELESAI: 'Selesai', BATAL: 'Batal', NONAKTIF: 'Nonaktif', DILEPAS: 'Dilepas',
  KONSULTANSI: 'Konsultansi Sistem Manajemen', AUDIT: 'Audit Internal / Second Party', PELATIHAN: 'Pelatihan (Public / In-house)',
  SERTIFIKASI: 'Pendampingan Sertifikasi', ELEARNING: 'E-Learning (TQ Learning)', LAINNYA: 'Lainnya',
  // kontak
  CLIENT: 'Klien', VENDOR: 'Vendor / Supplier', ASSOCIATE: 'Tenaga Ahli / Asosiasi',
  // akun
  ASSET: 'Aset', LIABILITY: 'Kewajiban', EQUITY: 'Ekuitas', REVENUE: 'Pendapatan', COST: 'Beban Langsung Proyek',
  EXPENSE: 'Beban Operasional', OTHER_INCOME: 'Pendapatan Lain-lain', OTHER_EXPENSE: 'Beban Lain-lain', INCOME_TAX: 'Pajak Penghasilan',
  DEBIT: 'Debit', CREDIT: 'Kredit',
  // jurnal
  MANUAL: 'Jurnal umum', OPENING: 'Saldo awal', INVOICE: 'Invoice', INVOICE_PAYMENT: 'Penerimaan piutang', BILL: 'Tagihan vendor',
  BILL_PAYMENT: 'Pembayaran hutang', CASH: 'Kas & bank', TAX_PAYMENT: 'Setor pajak', DEPRECIATION: 'Penyusutan',
  // arus kas
  CF_OPERATING: 'Arus kas dari aktivitas operasi', CF_INVESTING: 'Arus kas dari aktivitas investasi', CF_FINANCING: 'Arus kas dari aktivitas pendanaan',
  // kas
  IN: 'Penerimaan', OUT: 'Pengeluaran', TRANSFER: 'Transfer',
  // pajak
  ADDITION: 'Menambah (PPN)', DEDUCTION: 'Memotong (PPh)', SALES: 'Penjualan', PURCHASE: 'Pembelian', BOTH: 'Keduanya',
  // aset
  KOMPUTER: 'Komputer & Laptop', PERALATAN: 'Peralatan Kantor', FURNITUR: 'Furnitur & Inventaris', KENDARAAN: 'Kendaraan', BANGUNAN: 'Bangunan',
  // peran
  MANAJER_KEUANGAN: 'Manajer Keuangan', STAF_KEUANGAN: 'Staf Keuangan', PIMPINAN: 'Pimpinan / Direksi',
};

export const labelOf = (v) => LABELS[v] ?? v;

const green = 'badge-success', yellow = 'badge-warning', red = 'badge-danger', blue = 'badge-info', navy = 'badge-navy', orange = 'badge-orange', gray = 'badge-gray';
export const STATUS_STYLES = {
  UNPAID: yellow, PARTIAL: blue, PAID: green, VOID: gray, OVERDUE: red,
  AKTIF: green, DITAHAN: yellow, SELESAI: navy, BATAL: gray, NONAKTIF: gray, DILEPAS: gray,
  CLIENT: navy, VENDOR: orange, ASSOCIATE: blue,
  IN: green, OUT: red, TRANSFER: blue,
  ADDITION: blue, DEDUCTION: orange,
  MANUAL: gray, OPENING: navy, INVOICE: navy, INVOICE_PAYMENT: green, BILL: orange, BILL_PAYMENT: red, CASH: blue, TAX_PAYMENT: yellow, DEPRECIATION: gray,
};

export const idr = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v ?? 0));
export const fmtNum = (v, d = 0) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: d }).format(Number(v ?? 0));
// Angka akuntansi: negatif dalam kurung, nol sebagai tanda pisah.
export const acc = (v) => {
  const n = Math.round(Number(v ?? 0));
  if (n === 0) return '-';
  const s = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.abs(n));
  return n < 0 ? `(${s})` : s;
};
