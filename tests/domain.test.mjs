import test from 'node:test';
import assert from 'node:assert/strict';
import { agingBucket, computeInvoice, guessKind, kindCategory, parsePresenters, formatInvoiceNumber, nextFollowUp, normalizeShortCode, paymentStatus, suggestShortCode, terbilang } from '../src/lib/domain/billing.js';
import { canAccess, canWrite } from '../src/lib/access.js';
import { programGroup, programOrder, termKind } from '../src/lib/domain/programs.js';

test('nomor invoice baku INV-COP/NO/MM/YY', () => {
  assert.equal(formatInvoiceNumber('ELD', 1247, '2026-09-18T00:00:00Z'), 'INV-ELD/1247/09/26');
  assert.equal(formatInvoiceNumber('DBG', 2301, '2026-01-05T00:00:00Z'), 'INV-DBG/2301/01/26');
});

test('singkatan Copart', () => {
  assert.equal(suggestShortCode('PT Dwi Bintang Global'), 'DBG');
  assert.equal(suggestShortCode('CV Mamoru'), 'MAM');
  assert.equal(normalizeShortCode(' eld '), 'ELD');
  assert.equal(normalizeShortCode('x'), null);
});

test('Seri TQ: nilai termasuk PPN dipecah DPP = 100/111 seperti format TQ', () => {
  const r = computeInvoice({ items: [{ amount: 275_000_000 }], series: 'TQ', taxMode: 'PPN_INCLUDED', ppnRate: 11 });
  assert.equal(r.dpp, 247_747_748);
  assert.equal(r.ppn, 27_252_252);
  assert.equal(r.total, 275_000_000);
  assert.equal(r.dpp + r.ppn, r.total);
});

test('Seri TQ: PPN ditambahkan di atas nilai', () => {
  const r = computeInvoice({ items: [{ amount: 18_750_000 }], series: 'TQ', taxMode: 'PPN_EXCLUDED', ppnRate: 11 });
  assert.equal(r.ppn, 2_062_500);
  assert.equal(r.total, 20_812_500);
});

test('Seri Operasional selalu tanpa PPN', () => {
  const r = computeInvoice({ items: [{ amount: 1_650_000 }, { amount: 1_725_000 }], series: 'OPS', taxMode: 'PPN_INCLUDED', ppnRate: 11 });
  assert.equal(r.taxMode, 'NONE');
  assert.equal(r.ppn, 0);
  assert.equal(r.total, 3_375_000);
});

test('status pembayaran (dana + PPh 23 + biaya bank)', () => {
  assert.equal(paymentStatus(100, 0), 'UNPAID');
  assert.equal(paymentStatus(100, 40), 'PARTIAL');
  assert.equal(paymentStatus(100, 100), 'PAID');
});

test('follow up H+3 setelah kirim, mengikuti janji bayar', () => {
  const sent = new Date('2026-11-02T00:00:00Z');
  assert.equal(nextFollowUp({ sentAt: sent }).toISOString().slice(0, 10), '2026-11-05');
  assert.equal(nextFollowUp({ sentAt: sent, lastFollowUp: new Date('2026-11-06T00:00:00Z') }).toISOString().slice(0, 10), '2026-11-09');
  assert.equal(nextFollowUp({ sentAt: sent, lastFollowUp: new Date('2026-11-06T00:00:00Z'), promiseDate: new Date('2026-11-20T00:00:00Z') }).toISOString().slice(0, 10), '2026-11-20');
  assert.equal(nextFollowUp({ sentAt: null }), null);
});

test('umur piutang berdasarkan hari lewat jatuh tempo', () => {
  const asOf = new Date('2026-11-04T00:00:00Z');
  assert.equal(agingBucket('2026-11-10', asOf), 'current');
  assert.equal(agingBucket('2026-10-20', asOf), 'd30');
  assert.equal(agingBucket('2026-09-20', asOf), 'd60');
  assert.equal(agingBucket('2026-08-20', asOf), 'd90');
  assert.equal(agingBucket('2026-01-01', asOf), 'over90');
});

test('terbilang rupiah', () => {
  assert.equal(terbilang(1_250_000), 'satu juta dua ratus lima puluh ribu rupiah');
  assert.equal(terbilang(111), 'seratus sebelas rupiah');
});

test('hak akses: pimpinan hanya baca, staf tidak bisa ubah pengaturan', () => {
  assert.equal(canAccess('PIMPINAN', '/billing'), true);
  assert.equal(canAccess('PIMPINAN', '/api/invoices', 'POST'), false);
  assert.equal(canAccess('STAF_KEUANGAN', '/api/invoices', 'POST'), true);
  assert.equal(canWrite('STAF_KEUANGAN', 'settings'), false);
  assert.equal(canAccess('STAF_KEUANGAN', '/users'), false);
  assert.equal(canAccess('MANAJER_KEUANGAN', '/api/settings/assets', 'PUT'), true);
  assert.equal(canAccess('MANAJER_KEUANGAN', '/journals'), false);
});

test('presenter dari Daftar Kontrak: kode jadi presenter, sisanya keterangan', () => {
  assert.deepEqual(parsePresenters('BLA|JHN 3%'), { codes: ['BLA', 'JHN'], notes: ['JHN 3%'] });
  assert.deepEqual(parsePresenters('BLA.JHN|KK'), { codes: ['BLA', 'JHN', 'KK'], notes: [] });
  assert.deepEqual(parsePresenters('CSD NO BONUS'), { codes: [], notes: ['CSD NO BONUS'] });
  assert.deepEqual(parsePresenters('DSY | JHN 3%').codes, ['DSY', 'JHN']);
});

test('jenis invoice & kelompoknya', () => {
  assert.equal(guessKind('Tiket pesawat SUB-BPN'), 'TRANSPORTASI');
  assert.equal(guessKind('Uang makan'), 'KONSUMSI');
  assert.equal(guessKind('Pelunasan QMS'), 'PELUNASAN');
  assert.equal(guessKind('Tahap DP'), 'TAHAP_DP');
  assert.equal(guessKind('Audit MTC ke 3'), 'AUDIT');
  assert.equal(kindCategory('TRANSPORTASI'), 'AKOMODASI');
  assert.equal(kindCategory('PELUNASAN'), 'KONTRAK');
  assert.equal(termKind('Tahap Kontrak', 0, 6), 'TAHAP_DP');
  assert.equal(termKind('Bulan Kelima', 5, 6), 'TERMIN');
  assert.equal(termKind('Pelunasan', 1, 2), 'PELUNASAN');
});

test('program: kelompok & Audit didahulukan', () => {
  assert.equal(programGroup('AUDIT MTC KE 3'), 'AUDIT');
  assert.equal(programGroup('ISO 2026 ABC'), 'SYSTEM');
  assert.equal(programGroup('SUNTZU'), 'TRAINING');
  const list = [{ standard: 'QMS' }, { standard: 'AUDIT' }].sort(programOrder);
  assert.equal(list[0].standard, 'AUDIT');
});
