// Katalog program TQ (System, Project, Training) — dipakai sebagai pilihan nama
// program di kontrak dan deskripsi invoice. Tetap bisa diketik bebas.
export const PROGRAMS = {
  SYSTEM: [
    'Excellence Management System',
    'Quality Empowerment System',
    'Quality Management System (ISO 9001)',
    'Environmental Management System (ISO 14001)',
    'Occupational Health & Safety Management System (ISO 45001)',
    'Food Safety Management System (ISO 22000)',
    'Integrated Management System',
    'Quality Improvement System',
    'Continuous Empowerment System',
    'Holding Company Management System',
  ],
  PROJECT: [
    'Sales Acceleration Project',
    'Managerial Leadership Project',
    'Human Resources Management Project',
    'Family Business Management Project',
    'Document Management Project',
    'Product Forecasting Project',
    'Production Control Project',
  ],
  TRAINING: [
    'Initial Assessment',
    'Psycho Attitude Test',
    'Evaluation',
    'Business Diagnostics',
    'Quick Market Check-Up',
    'Agent of Change Training',
    'In-house Motivational Training',
    'Corporate Culture Continuous Training',
    'Corporate Culture Development Training',
    'Sun Tzu Leadership Training',
  ],
  AUDIT: ['Audit Maintenance', 'Audit Internal', 'Audit Second Party'],
};

export const PROGRAM_GROUPS = ['SYSTEM', 'PROJECT', 'TRAINING', 'AUDIT', 'LAINNYA'];

// Pola termin bawaan (dari Berita Acara Closing): [nama pola, [[nama termin, persen]]].
export const TERM_TEMPLATES = [
  ['6 tahap sama rata', [['Tahap Kontrak', 100 / 6], ['Bulan Pertama', 100 / 6], ['Bulan Kedua', 100 / 6], ['Bulan Ketiga', 100 / 6], ['Bulan Keempat', 100 / 6], ['Bulan Kelima', 100 / 6]]],
  ['DP 50% · pelunasan 50%', [['Tahap DP', 50], ['Pelunasan', 50]]],
  ['30 / 40 / 30', [['Tahap Kontrak', 30], ['Progres', 40], ['Pelunasan', 30]]],
  ['Lunas di muka', [['Tahap Kontrak', 100]]],
];
