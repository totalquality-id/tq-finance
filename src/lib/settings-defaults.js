// Nilai awal parameter. Dapat diubah Manajer Keuangan di /settings.
// `fields` menjelaskan bentuk form; jenis "account" berarti dipilih dari bagan akun (nilai = kode akun).
export const SETTING_DEFAULTS = {
  'company.profile': {
    label: 'Profil perusahaan',
    hint: 'Tampil di kop invoice, laporan, dan cetakan.',
    value: {
      name: 'PT. Total Quality Indonesia',
      address: 'Jl. Raya Jemursari No. 85 B, Surabaya, Jawa Timur',
      phone: '+62 31 848 4690',
      email: 'finance@totalquality.co.id',
      website: 'www.totalquality.co.id',
      npwp: '',
    },
    fields: { name: 'Nama perusahaan', address: 'Alamat', phone: 'Telepon', email: 'Email finance', website: 'Website', npwp: 'NPWP' },
  },
  'accounts.mapping': {
    label: 'Pemetaan akun default',
    hint: 'Akun yang dipakai otomatis saat invoice, tagihan, dan laporan diposting.',
    value: {
      receivable: '1131',
      revenue: '4101',
      salesDiscount: '4901',
      payable: '2111',
      expense: '5109',
      bankFee: '7201',
      retainedEarnings: '3201',
      currentEarnings: '3202',
      depreciationExpense: '6141',
    },
    fields: {
      receivable: 'Piutang usaha',
      revenue: 'Pendapatan jasa (default)',
      salesDiscount: 'Potongan penjualan',
      payable: 'Hutang usaha',
      expense: 'Beban default tagihan vendor',
      bankFee: 'Beban administrasi bank',
      retainedEarnings: 'Laba ditahan',
      currentEarnings: 'Laba tahun berjalan',
      depreciationExpense: 'Beban penyusutan',
    },
    accountFields: true,
  },
  'invoice.print': {
    label: 'Cetak invoice',
    hint: 'Rekening pembayaran dan penanda tangan pada invoice.',
    value: {
      bankName: 'Bank Mandiri',
      bankAccount: '',
      bankHolder: 'PT. Total Quality Indonesia',
      signerName: '',
      signerTitle: 'Manajer Keuangan',
      footerNote: 'Mohon cantumkan nomor invoice pada berita transfer. Bukti potong PPh 23 mohon dikirim ke email finance.',
    },
    fields: { bankName: 'Nama bank', bankAccount: 'No. rekening', bankHolder: 'Atas nama', signerName: 'Nama penanda tangan', signerTitle: 'Jabatan penanda tangan', footerNote: 'Catatan kaki' },
  },
  'reminder.thresholds': {
    label: 'Pengingat jatuh tempo (hari sebelum)',
    value: { invoiceDueDays: 7, billDueDays: 7 },
    fields: { invoiceDueDays: 'Invoice ke klien', billDueDays: 'Tagihan vendor' },
  },
};

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS);
// Tanggal tutup buku disimpan terpisah (bukan form umum): transaksi s.d. tanggal ini terkunci.
export const LOCK_KEY = 'closing.lockDate';
