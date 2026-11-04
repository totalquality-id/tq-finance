// Sub-menu modul yang tampil di sidebar. Setiap sub-menu adalah tampilan pada
// halaman modulnya, dipilih lewat ?tab= sehingga bisa dibuka langsung dan
// tetap terpilih saat halaman dimuat ulang. Aman dipakai di client.

export const MODULE_TABS = {
  '/contacts': {
    param: 'tab',
    items: [
      ['CLIENT', 'Klien'],
      ['VENDOR', 'Vendor / Supplier'],
      ['ASSOCIATE', 'Tenaga ahli / asosiasi'],
    ],
  },
  '/reports': {
    param: 'tab',
    items: [
      ['pl', 'Laba rugi'],
      ['bs', 'Neraca'],
      ['cf', 'Arus kas'],
      ['tb', 'Neraca saldo'],
      ['gl', 'Buku besar'],
      ['daily', 'Kas harian'],
      ['ar', 'Umur piutang'],
      ['ap', 'Umur hutang'],
      ['projects', 'Profitabilitas proyek'],
    ],
  },
  '/tax': {
    param: 'tab',
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

/** Kunci sub-menu yang valid dari nilai query; jatuh ke sub-menu pertama. */
export function currentTab(path, value) {
  const items = tabsFor(path);
  return items.some(([key]) => key === value) ? value : items[0]?.[0];
}

export function tabLabel(path, key) {
  return tabsFor(path).find(([k]) => k === key)?.[1] ?? '';
}
