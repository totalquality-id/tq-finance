# TQ Finance — Penagihan & Invoicing PT Total Quality Indonesia

Aplikasi penagihan untuk tim finance TQ, mengikuti SOP Penagihan (SOP-CSD-002):
kontrak dari CCD → invoice & faktur pajak → kirim (ekspedisi/email) → follow up 2–3 hari → pembayaran → laporan pemasukan ke Direktur Utama.
Stack sama dengan prohaba-hse: Next.js 16 (App Router, JS), Auth.js v5, Prisma 7 + `@prisma/adapter-pg`, PostgreSQL (Supabase), Node.js 22.

## Menu

| Menu | Isi |
|---|---|
| Dashboard | Piutang belum lunas, kontrak berjalan, pendapatan bulan ini, omset tahun berjalan, umur piutang, Copart terbesar, invoice jatuh tempo, perlu follow up, termin siap ditagih |
| Invoice | Dua seri, format Jasa / Tiket, Invoice / Kwitansi, kirim, follow up, pembayaran (PPh 23 + bukti potong), cetak A4 / PDF, ekspor rekap nomor |
| Monitoring Penagihan | Matriks Copart/kontrak × bulan (pengganti sheet "Piutang Penagihan"): target, tertagih, outstanding, % penagihan |
| Kontrak & Termin | Data Berita Acara Closing: program, departemen, presenter, no. kontrak/SPK, total close, termin (pola 6 tahap, DP/pelunasan, 30/40/30) |
| Copart | Data Copart + singkatan untuk nomor invoice |
| Laporan Penagihan | Laporan pemasukan, rekap invoice per bulan, umur piutang, pencapaian kontrak vs target departemen |

## Dua seri invoice

| | Seri TQ | Seri Operasional |
|---|---|---|
| Tampilan | Kop surat (logo baru + strip footer), stempel, tanda tangan | Polos, tanpa kop & stempel, tanda tangan |
| Pajak | PPN (nilai termasuk PPN → DPP = 100/111, atau PPN ditambahkan), no. faktur pajak | Tanpa PPN |
| Rekening | Rekening PT (Pengaturan → Seri TQ) | Rekening operasional (Pengaturan → Seri Operasional) |
| Nomor | `INV-COP/1276/11/26` (melanjutkan rekap 1xxx) | `INV-COP/2301/11/26` (melanjutkan rekap 2xxx) |

Invoice / kwitansi bisa memakai e-Meterai: centang "Pakai e-Meterai", cetak ke PDF (tersedia ruang kosong di samping tanda tangan), bubuhkan di portal e-Meterai resmi, lalu catat no. serinya. Kwitansi ≥ Rp5.000.000 wajib bermeterai. Seluruh invoice kedua seri tercatat di laporan yang sama.

## Data internal

Rekening, nama penanda tangan, stempel, tanda tangan, nomor awal, dan target departemen **tidak ada di kode**. Isi lewat
`/settings` atau dari file JSON privat:

    node --env-file=<env> scripts/apply-invoice-settings.mjs <settings.json>

Folder `Data/` (format & data asli finance) diabaikan git.

## Development

    npm install
    cp .env.example .env
    npm run db:migrate && npm run seed
    npm run seed:demo      # opsional, hanya DB lokal
    npm run dev

## Produksi (Supabase + Vercel)

Lihat `scripts/setup-db.mjs` (role `tqf_migrate`/`tqf_runtime`, RLS) dan `scripts/vercel-env.mjs`. Urutan setiap ada migrasi:

    npm run db:status:production
    npm run db:migrate:production
    node --env-file=.env scripts/setup-db.mjs grants

lalu push ke `master` (Vercel deploy otomatis).

    npm run verify    # lint + unit test + build
