// Bagian (tab) di dalam halaman modul, tampil sebagai navigasi vertikal di kiri
// konten. Dipilih lewat ?tab= sehingga bisa dibuka langsung, dibagikan, dan tetap
// terpilih saat dimuat ulang. Item: [kunci, label, grup?]. Aman dipakai di client.

export const MODULE_TABS = {
  '/reports': {
    param: 'tab',
    label: 'Jenis laporan',
    items: [
      ['income', 'Laporan pemasukan', 'Penagihan'],
      ['invoices', 'Rekap invoice', 'Penagihan'],
      ['aging', 'Umur piutang', 'Penagihan'],
      ['contracts', 'Pencapaian kontrak', 'Kontrak'],
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
