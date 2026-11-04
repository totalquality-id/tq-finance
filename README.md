# TQ Finance — PT. Total Quality Indonesia

Sistem akuntansi & keuangan untuk **tim finance** PT. Total Quality Indonesia (kantor jasa konsultan ISO, audit, dan pelatihan).
Fungsi inti mengikuti *dbg-finance* (COA, kontak, jurnal umum, kas & bank, piutang, hutang, laporan, pajak dinamis),
dibangun ulang dengan arsitektur & UI *prohaba-hse*: Next.js 16 (App Router, JS), Auth.js v5, Prisma 7 + `@prisma/adapter-pg`,
PostgreSQL, design system yang sama — warna biru korporat TQ `#173e76` dengan aksen kuning logo `#FACC01`. Node.js 22.

## Modul

| Grup | Modul | Halaman | Isi |
|---|---|---|---|
| Utama | Dashboard | `/dashboard` | Saldo kas/bank, piutang & hutang (lewat tempo), pendapatan/laba bulan & tahun berjalan, grafik 12 bulan, umur piutang, klien terbesar, jatuh tempo ≤ 14 hari |
| | Notifikasi | `/notifications` | Pengingat invoice & tagihan jatuh tempo, tenggat setor PPh (tgl 15) & SPT Masa PPN |
| Transaksi | Piutang & Invoice | `/invoices` | Invoice per termin proyek / bebas, PPN & PPh 23 dinamis, diskon, penerimaan bertahap + biaya transfer, batal (void), cetak/PDF dengan terbilang |
| | Hutang & Tagihan | `/bills` | Tagihan vendor & honor tenaga ahli, dibebankan per akun & proyek, PPN masukan, potong PPh 21/23/4(2), pembayaran bertahap |
| | Kas & Bank | `/cash` | Penerimaan, pengeluaran (multi-baris), transfer antar rekening, saldo per rekening |
| | Jurnal Umum | `/journals` | Jurnal manual/penyesuaian & saldo awal; jurnal otomatis dari modul lain (read-only) |
| Master | Klien & Vendor | `/contacts` | Klien, vendor/supplier, tenaga ahli asosiasi (NPWP, PKP, termin, rekening) |
| | Proyek & Kontrak | `/projects` | Kontrak jasa (konsultansi/audit/pelatihan/sertifikasi), termin penagihan (pola 30/40/30), anggaran biaya, margin |
| | Bagan Akun | `/accounts` | 101 akun khusus kantor konsultan (hirarkis, saldo berjalan) |
| | Aset Tetap | `/assets` | Laptop, proyektor, kendaraan; penyusutan garis lurus bulanan otomatis (posting & batal per periode) |
| Laporan | Laporan Keuangan | `/reports` | Laba rugi (per proyek), neraca, arus kas (langsung), neraca saldo, buku besar, kas harian, umur piutang, umur hutang, profitabilitas proyek — ekspor Excel & cetak |
| | Pajak | `/tax` | Rekap PPN per masa, PPh dipotong (oleh TQ & oleh klien), saldo hutang pajak, setoran (kode billing/NTPN) |
| Sistem | Pengguna, Pengaturan, Audit Log | `/users`, `/settings`, `/audit-log` | Peran, profil perusahaan, pemetaan akun, pajak dinamis, data cetak invoice, **tutup buku** |

Peran: **Manajer Keuangan** (semua + COA, pengaturan, tutup buku, pengguna), **Staf Keuangan** (input transaksi), **Pimpinan/Direksi** (baca saja).

Rancangan & asumsi modul: `docs/rancangan-modul.md`.

## Aturan akuntansi

- Semua transaksi diposting lewat satu mesin jurnal (`src/lib/services/ledger.js`): wajib seimbang, hanya akun detail aktif, nomor `JU-YYYYMM-0001`.
- Invoice: Piutang (D) + Potongan (D) + PPh 23 dibayar dimuka (D) vs Pendapatan (K) + PPN Keluaran (K).
- Tagihan: Beban/aset per baris + PPN Masukan (D) vs Hutang usaha + Hutang PPh (K).
- Tanggal ≤ **tanggal tutup buku** tidak dapat ditambah/diubah/dihapus. Laba ditahan & laba tahun berjalan di neraca dihitung otomatis (tanpa jurnal penutup).

## Menjalankan development

PostgreSQL lokal (Laragon, port 5432). Database `tq_finance` dengan role superuser lokal.

    npm install
    cp .env.example .env          # isi AUTH_SECRET & SEED_ADMIN_PASSWORD
    npm run db:migrate            # terapkan migrasi
    npm run seed                  # bagan akun, pajak default, akun Manajer Keuangan
    npm run seed:demo             # opsional: klien, proyek, invoice, tagihan, kas contoh (hanya development)
    npm run dev

Akun pertama: `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` dari `.env`. Seed demo juga membuat akun staf & direktur
(email di `prisma/seed-demo.js`, kata sandi sama dengan `SEED_ADMIN_PASSWORD`).

## Database Supabase (produksi)

Project Supabase **tq-finance** (ref `gaowwopianxrwcbsutjg`, region `ap-northeast-1`), schema `public`. Pola keamanan sama dengan prohaba-hse:

- `tqf_migrate` — pemilik tabel, hanya untuk migrasi (session pooler :5432) → `.env.migrations.production.local`
- `tqf_runtime` — dipakai aplikasi/Vercel (transaction pooler :6543), NOBYPASSRLS, tanpa DDL → `.env.runtime.production.local`
- RLS aktif di semua tabel; `anon`/`authenticated` Supabase tidak punya akses tabel; `AuditLog` append-only.
- Akun Manajer Keuangan pertama: `.env.admin.production.local` (ganti kata sandi setelah login pertama).

Setup dari nol (token Management API `SUPABASE_ACCESS_TOKEN` di `.env`):

    node --env-file=.env scripts/setup-db.mjs roles
    npm run db:migrate:production
    node --env-file=.env scripts/setup-db.mjs grants     # ulangi setiap migrasi menambah tabel
    npm run seed:production

Perubahan schema: buat migrasi di lokal (`npm run db:migrate:dev`), lalu `npm run db:status:production` dan
`npm run db:migrate:production` + `grants` **sebelum** deploy kode yang memakai kolom baru. Jangan memakai `db push`.

`.env` development saat ini menunjuk ke Supabase (role runtime); URL PostgreSQL lokal Laragon tersimpan sebagai komentar.

## Deploy (Vercel)

Env Vercel: `DATABASE_URL` (isi `.env.runtime.production.local`), `AUTH_SECRET`, `CRON_SECRET`, `APP_TIMEZONE`.
Di luar Vercel (`next start` biasa) isi juga `AUTH_URL`. Vercel Cron memanggil `/api/cron/reminders` harian
(header `Authorization: Bearer CRON_SECRET`).

## Pengujian

    npm run verify    # lint + unit test (aturan akuntansi & hak akses) + build
