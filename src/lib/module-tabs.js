// Bagian (tab) di dalam halaman modul, tampil sebagai navigasi vertikal di kiri
// konten. Dipilih lewat ?tab= sehingga bisa dibuka langsung, dibagikan, dan tetap
// terpilih saat dimuat ulang. Item: [kunci, label, grup?]. Aman dipakai di client.

export const MODULE_TABS = {
  '/contacts': {
    param: 'tab',
    label: 'Jenis kontak',
    items: [
      ['CLIENT', 'Copart'],
      ['VENDOR', 'Vendor / Supplier'],
      ['ASSOCIATE', 'Tenaga ahli / asosiasi'],
    ],
  },
  '/reports': {
    param: 'tab',
    label: 'Jenis laporan',
    items: [
      ['pl', 'Laba rugi', 'Laporan utama'],
      ['bs', 'Neraca', 'Laporan utama'],
      ['cf', 'Arus kas', 'Laporan utama'],
      ['tb', 'Neraca saldo', 'Buku'],
      ['gl', 'Buku besar', 'Buku'],
      ['daily', 'Kas harian', 'Buku'],
      ['ar', 'Umur piutang', 'Analisis'],
      ['ap', 'Umur hutang', 'Analisis'],
      ['projects', 'Profitabilitas proyek', 'Analisis'],
    ],
  },
  '/tax': {
    param: 'tab',
    label: 'Jenis pajak',
    items: [
      ['ppn', 'Rekap PPN'],
      ['withholding', 'PPh dipotong'],
      ['payments', 'Setoran pajak'],
    ],
  },
};

export function tabsFor(path) {
  return MODULE_TABS[path]?.items ?? [];
}

/** Kunci tab yang valid dari nilai query; jatuh ke tab pertama. */
export function currentTab(path, value) {
  const items = tabsFor(path);
  return items.some(([key]) => key === value) ? value : items[0]?.[0];
}

export function tabLabel(path, key) {
  return tabsFor(path).find(([k]) => k === key)?.[1] ?? '';
}
