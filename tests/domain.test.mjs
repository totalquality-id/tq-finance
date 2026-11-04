import test from 'node:test';
import assert from 'node:assert/strict';
import { agingBucket, balanceLines, cashFlowActivity, computeDocument, depreciationFor, mergeLines, paymentStatus, terbilang } from '../src/lib/domain/accounting.js';
import { canAccess, canWrite } from '../src/lib/access.js';

test('jurnal harus seimbang dan tiap baris hanya debit atau kredit', () => {
  const ok = balanceLines([{ accountId: 'a', debit: 100, credit: 0 }, { accountId: 'b', debit: 0, credit: 100 }]);
  assert.equal(ok.totalDebit, 100);
  assert.throws(() => balanceLines([{ accountId: 'a', debit: 100 }, { accountId: 'b', credit: 90 }]), /tidak seimbang/);
  assert.throws(() => balanceLines([{ accountId: 'a', debit: 100, credit: 100 }, { accountId: 'b', credit: 0 }]), /salah satu/);
  assert.throws(() => balanceLines([{ accountId: 'a', debit: 100 }]), /minimal dua/);
});

test('baris jurnal dengan akun & sisi sama digabung', () => {
  const m = mergeLines([{ accountId: 'a', debit: 50, credit: 0 }, { accountId: 'a', debit: 25, credit: 0 }, { accountId: 'b', debit: 0, credit: 75 }, { accountId: 'c', debit: 0, credit: 0 }]);
  assert.equal(m.length, 2);
  assert.equal(m[0].debit, 75);
});

test('invoice jasa: PPN menambah, PPh 23 memotong dari DPP setelah diskon', () => {
  const d = computeDocument({ items: [{ quantity: 1, unitPrice: 10_000_000 }], discount: 1_000_000, taxes: [{ rate: 11, type: 'ADDITION' }, { rate: 2, type: 'DEDUCTION' }] });
  assert.equal(d.base, 9_000_000);
  assert.equal(d.taxAdd, 990_000);
  assert.equal(d.taxDeduct, 180_000);
  assert.equal(d.total, 9_810_000);
  // Jurnal invoice seimbang: D piutang + diskon + PPh23 = K pendapatan + PPN
  assert.equal(d.total + d.discount + d.taxDeduct, d.subtotal + d.taxAdd);
  assert.throws(() => computeDocument({ items: [{ quantity: 1, unitPrice: 100 }], discount: 200 }), /Diskon/);
});

test('status pembayaran', () => {
  assert.equal(paymentStatus(100, 0), 'UNPAID');
  assert.equal(paymentStatus(100, 40), 'PARTIAL');
  assert.equal(paymentStatus(100, 100), 'PAID');
});

test('umur piutang berdasarkan hari lewat jatuh tempo', () => {
  const asOf = new Date('2026-11-04T00:00:00Z');
  assert.equal(agingBucket('2026-11-10', asOf), 'current');
  assert.equal(agingBucket('2026-10-20', asOf), 'd30');
  assert.equal(agingBucket('2026-09-20', asOf), 'd60');
  assert.equal(agingBucket('2026-08-20', asOf), 'd90');
  assert.equal(agingBucket('2026-01-01', asOf), 'over90');
});

test('penyusutan garis lurus: aturan tanggal 15 dan bulan terakhir menutup sisa', () => {
  const a = { cost: 10_000_000, residualValue: 0, usefulLifeMonths: 3, acquisitionDate: '2026-01-10' };
  assert.equal(depreciationFor(a, '2025-12', 0), 0);
  assert.equal(depreciationFor(a, '2026-01', 0), 3_333_333);
  assert.equal(depreciationFor(a, '2026-03', 6_666_666), 3_333_334);
  assert.equal(depreciationFor(a, '2026-04', 10_000_000), 0);
  const late = { ...a, acquisitionDate: '2026-01-20' };
  assert.equal(depreciationFor(late, '2026-01', 0), 0);
  assert.equal(depreciationFor(late, '2026-02', 0), 3_333_333);
});

test('klasifikasi arus kas dari akun lawan', () => {
  assert.equal(cashFlowActivity({ type: 'ASSET', code: '1201' }), 'INVESTING');
  assert.equal(cashFlowActivity({ type: 'EQUITY', code: '3101' }), 'FINANCING');
  assert.equal(cashFlowActivity({ type: 'LIABILITY', code: '2201' }), 'FINANCING');
  assert.equal(cashFlowActivity({ type: 'LIABILITY', code: '2111' }), 'OPERATING');
  assert.equal(cashFlowActivity({ type: 'REVENUE', code: '4101' }), 'OPERATING');
});

test('terbilang rupiah', () => {
  assert.equal(terbilang(1_250_000), 'satu juta dua ratus lima puluh ribu rupiah');
  assert.equal(terbilang(111), 'seratus sebelas rupiah');
  assert.equal(terbilang(0), 'nol rupiah');
});

test('hak akses: pimpinan hanya baca, staf tidak bisa ubah COA/pengaturan', () => {
  assert.equal(canAccess('PIMPINAN', '/reports'), true);
  assert.equal(canAccess('PIMPINAN', '/api/invoices', 'POST'), false);
  assert.equal(canAccess('STAF_KEUANGAN', '/api/invoices', 'POST'), true);
  assert.equal(canWrite('STAF_KEUANGAN', 'accounts'), false);
  assert.equal(canAccess('STAF_KEUANGAN', '/api/settings/lock', 'PUT'), false);
  assert.equal(canAccess('STAF_KEUANGAN', '/users'), false);
  assert.equal(canAccess('MANAJER_KEUANGAN', '/api/settings/lock', 'PUT'), true);
  assert.equal(canAccess('KONSULTAN', '/dashboard'), false);
});
