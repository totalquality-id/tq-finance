# Rancangan modul TQ Finance — asumsi & bahan diskusi

## Pengguna

Aplikasi ini **khusus tim finance** TQ (bukan untuk konsultan). Konsultan tidak login; biaya perjalanan/reimburse
konsultan dicatat oleh finance lewat *Kas & Bank* (pengeluaran) atau *Tagihan* (honor tenaga ahli asosiasi).

| Peran | Hak |
|---|---|
| Manajer Keuangan | Semua transaksi, bagan akun, pengaturan & pajak dinamis, tutup buku, pengguna, audit log |
| Staf Keuangan | Invoice, tagihan, kas & bank, jurnal, aset, setoran pajak, kontak, proyek |
| Pimpinan / Direksi | Baca dashboard, transaksi, dan seluruh laporan |

## Dari dbg-finance (dipertahankan)

COA dengan seed otomatis, kontak (klien/vendor), jurnal umum double-entry tervalidasi, kas & bank masuk/keluar,
piutang (invoice + pembayaran parsial + aging), hutang (bill + pembayaran), laporan Buku Besar, Neraca Saldo,
Laba Rugi, Neraca, Arus Kas, Kas Harian, Umur Piutang, pengaturan perusahaan, pemetaan akun default, **pajak dinamis**
(menambah/memotong), cetak invoice dengan terbilang.

Tidak diambil: "buku pajak" terpisah (akses `tax` / `bookType`) — TQ Finance memakai satu buku besar.

## Tambahan untuk kantor konsultan (asumsi)

1. **Proyek & kontrak** sebagai pusat pendapatan & biaya. Jasa: konsultansi sistem manajemen, audit internal/second
   party, pelatihan, pendampingan sertifikasi, e-learning (TQ Learning). Setiap invoice, tagihan, kas, dan baris jurnal
   dapat ditandai proyek → laporan **profitabilitas proyek** dan **laba rugi per proyek**.
2. **Termin penagihan** (DP / progres / pelunasan; pola bawaan 30/40/30) yang langsung menjadi invoice.
3. **Tenaga ahli asosiasi** (auditor/trainer lepas) sebagai jenis kontak; tagihan honor otomatis mengusulkan PPh 21.
4. **Pajak Indonesia**: PPN 12% × DPP 11/12 (efektif 11%), PPh 23 jasa 2% dipotong klien (kredit pajak), PPh 21 bukan
   pegawai 2,5%, PPh 4(2) sewa 10%. Rekap PPN per masa, daftar PPh dipotong, setoran dengan kode billing & NTPN.
5. **Aset tetap & penyusutan** garis lurus (kelompok 1 = 4 th, kelompok 2 = 8 th, bangunan = 20 th).
6. **Tutup buku** per tanggal; **audit log** semua perubahan; **pengingat** jatuh tempo & tenggat pajak.

## Bagan akun (ringkas)

- 11xx Aset lancar: kas kantor, kas kecil, bank, piutang, pendapatan belum ditagih, uang muka dinas, PPN masukan, PPh 23/25 dibayar dimuka, sewa dibayar dimuka
- 12xx Aset tetap & akumulasi penyusutan · 13xx Uang jaminan, lisensi software/modul
- 21xx Hutang usaha, honor tenaga ahli, reimburse, gaji, BPJS, PPN keluaran, hutang PPh 21/23/4(2)/29, uang muka klien · 22xx Hutang bank/leasing
- 3xxx Modal, prive, laba ditahan, laba tahun berjalan
- 41xx Pendapatan per jenis jasa · 4901 potongan penjualan
- 51xx Beban langsung proyek: honor tenaga ahli, transport, akomodasi, per diem, modul & sertifikat, venue, biaya lembaga sertifikasi
- 61xx Beban operasional: gaji, BPJS, sewa, utilitas, software, pemasaran, jasa profesional, pengembangan SDM & sertifikasi auditor, penyusutan
- 7xxx Pendapatan/beban lain (jasa giro, administrasi bank) · 8101 PPh badan

## Perlu keputusan TQ

- Nama badan hukum, NPWP, rekening, dan penanda tangan invoice (isi di Pengaturan).
- Apakah perlu modul **Penawaran (quotation)** sebelum kontrak, **anggaran tahunan** per akun, atau **rekonsiliasi bank** (import mutasi).
- Apakah PPN dicatat per faktur e-Faktur (Coretax) dan perlu ekspor CSV untuk impor.
- Kebijakan uang muka klien (DP dicatat sebagai pendapatan atau "Uang Muka Klien" sampai pekerjaan selesai).
- Pemisahan multi-entitas (mis. TQ Learning sebagai unit/perusahaan terpisah).
