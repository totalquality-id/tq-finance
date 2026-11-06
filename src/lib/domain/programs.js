// Program TQ sesuai kode yang dipakai di Daftar Kontrak. Dipakai sebagai saran
// isian Program; tetap bisa diketik bebas. [kode, kelompok, nama lengkap]
export const PROGRAM_LIST = [
  ['AUDIT', 'AUDIT', 'Audit Maintenance'],
  ['QMS', 'SYSTEM', 'Quality Management System (ISO 9001)'],
  ['QMS DMOS', 'SYSTEM', 'Quality Management System — DMOS'],
  ['EMP', 'SYSTEM', 'Excellence Management Program'],
  ['EMS', 'SYSTEM', 'Environmental Management System (ISO 14001)'],
  ['IMS', 'SYSTEM', 'Integrated Management System'],
  ['ISMS', 'SYSTEM', 'Information Security Management System (ISO 27001)'],
  ['ISO 2026 AB', 'SYSTEM', 'ISO 2026 paket AB'],
  ['ISO 2026 ABC', 'SYSTEM', 'ISO 2026 paket ABC'],
  ['HRMS', 'PROJECT', 'Human Resources Management System'],
  ['WORKLOAD PROGRAM', 'PROJECT', 'Workload Analysis Program'],
  ['CCDP', 'TRAINING', 'Corporate Culture Development Program'],
  ['SUNTZU', 'TRAINING', 'Sun Tzu Leadership Training'],
  ['PAT', 'TRAINING', 'Psycho Attitude Test'],
  ['IHT', 'TRAINING', 'In-house Training'],
  ['PENDAMPINGAN', 'LAINNYA', 'Pendampingan'],
  ['ADD COST', 'LAINNYA', 'Add Cost'],
];

export const PROGRAM_GROUPS = ['SYSTEM', 'PROJECT', 'TRAINING', 'AUDIT', 'LAINNYA'];

/** Kelompok program dari kodenya (AUDIT MTC KE 3 → AUDIT, ISO 2026 ABC → SYSTEM). */
export function programGroup(code) {
  const c = String(code ?? '').trim().toUpperCase();
  if (c.startsWith('AUDIT')) return 'AUDIT';
  const hit = PROGRAM_LIST.find(([k]) => c === k || c.startsWith(k + ' '));
  return hit ? hit[1] : 'LAINNYA';
}

// Program Audit selalu didahulukan, lalu program lain (aturan Daftar Kontrak).
export const programOrder = (a, b) => (programGroup(a.standard ?? a.name) === 'AUDIT' ? 0 : 1) - (programGroup(b.standard ?? b.name) === 'AUDIT' ? 0 : 1);

// Pola termin bawaan (dari Berita Acara Closing): [nama pola, [[nama termin, persen]]].
export const TERM_TEMPLATES = [
  ['6 tahap sama rata', [['Tahap Kontrak', 100 / 6], ['Bulan Pertama', 100 / 6], ['Bulan Kedua', 100 / 6], ['Bulan Ketiga', 100 / 6], ['Bulan Keempat', 100 / 6], ['Bulan Kelima', 100 / 6]]],
  ['DP 50% · pelunasan 50%', [['Tahap DP', 50], ['Pelunasan', 50]]],
  ['30 / 40 / 30', [['Tahap Kontrak', 30], ['Progres', 40], ['Pelunasan', 30]]],
  ['Lunas di muka', [['Tahap Kontrak', 100]]],
];

/** Jenis invoice untuk termin berdasarkan urutan & namanya. */
export function termKind(name, index, count) {
  const n = String(name ?? '').toUpperCase();
  if (/PELUNASAN/.test(n) || (count > 1 && index === count - 1 && /LUNAS/.test(n))) return 'PELUNASAN';
  if (/TAHAP (KONTRAK|DP)|^DP\b/.test(n) || index === 0) return 'TAHAP_DP';
  if (/AUDIT|MTC/.test(n)) return 'AUDIT';
  return 'TERMIN';
}
