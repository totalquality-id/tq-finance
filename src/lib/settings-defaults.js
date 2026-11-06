// Nilai awal parameter. Diubah Manajer Keuangan di /settings.
// Data sensitif (rekening, nama penanda tangan) sengaja kosong di sini dan diisi di database.
export const SETTING_DEFAULTS = {
  'company.profile': {
    label: 'Profil perusahaan',
    value: {
      name: 'PT Total Quality Indonesia',
      address: 'Jl. Raya Jemursari No. 85 B, Surabaya',
      city: 'Surabaya',
      phone: '+62 31 848 4690',
      email: '',
      website: 'www.totalquality.co.id',
      npwp: '',
    },
    fields: { name: 'Nama perusahaan', address: 'Alamat', city: 'Kota (tempat tanda tangan)', phone: 'Telepon', email: 'Email finance', website: 'Website', npwp: 'NPWP' },
  },
  'invoice.seriesTQ': {
    label: 'Seri TQ — kop surat, stempel, PPN',
    value: { bankName: '', bankAccount: '', bankHolder: '', nextNumber: 1 },
    fields: { bankName: 'Bank', bankAccount: 'No. rekening', bankHolder: 'Atas nama', nextNumber: 'Nomor berikutnya' },
  },
  'invoice.seriesOPS': {
    label: 'Seri Operasional — polos, tanpa PPN',
    value: { bankName: '', bankAccount: '', bankHolder: '', nextNumber: 1 },
    fields: { bankName: 'Bank', bankAccount: 'No. rekening', bankHolder: 'Atas nama', nextNumber: 'Nomor berikutnya' },
  },
  'invoice.document': {
    label: 'Dokumen invoice',
    value: {
      signerName: '',
      signerTitle: 'Finance Manager',
      ppnRate: 11,
      defaultDueDays: 14,
      invoiceNote: 'Invoice dinyatakan LUNAS setelah pembayaran diterima dan terverifikasi.',
      kwitansiNote: 'Kwitansi dinyatakan LUNAS setelah pembayaran diterima dan terverifikasi.',
    },
    fields: { signerName: 'Nama penanda tangan', signerTitle: 'Jabatan', ppnRate: 'Tarif PPN (%)', defaultDueDays: 'Jatuh tempo default (hari)', invoiceNote: 'Catatan invoice', kwitansiNote: 'Catatan kwitansi' },
  },
  'reminder.thresholds': {
    label: 'Pengingat',
    value: { invoiceDueDays: 7, followUpDays: 3 },
    fields: { invoiceDueDays: 'Invoice akan jatuh tempo (hari sebelum)', followUpDays: 'Follow up setelah dikirim (hari)' },
  },
  'targets.department': {
    label: 'Target omzet tahunan per departemen',
    value: { CCD: 0, SDD: 0, BSD: 0, HRD: 0, CSD: 0 },
    fields: { CCD: 'CCD', SDD: 'SDD', BSD: 'BSD', HRD: 'HRD', CSD: 'CSD - WE' },
  },
};

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS);
// Stempel & tanda tangan (gambar) disimpan terpisah, hanya dilayani ke pengguna yang login.
export const ASSETS_KEY = 'invoice.assets';
export const seriesKey = (series) => `invoice.series${series}`;
export const sequenceKey = (series) => `invoice-${series}`;
