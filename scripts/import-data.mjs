// Impor data awal (Copart, kontrak, rencana termin, invoice akomodasi) dari file JSON
// hasil scripts/private/prepare_import.py. Aman dijalankan ulang: data yang sudah ada dilewati.
//   node --env-file=<env> scripts/import-data.mjs <import.json>
import { readFileSync } from 'node:fs';
import { prisma } from '../src/lib/prisma.js';
import { guessKind, kindCategory, normalizePresenter, paymentStatus, round2 } from '../src/lib/domain/billing.js';
import { programGroup } from '../src/lib/domain/programs.js';
import { getSettings } from '../src/lib/settings.js';
import { seriesKey, sequenceKey } from '../src/lib/settings-defaults.js';

const file = process.argv[2];
if (!file) throw new Error('Pemakaian: import-data.mjs <import.json>');
const data = JSON.parse(readFileSync(file, 'utf8'));
const ACTOR = 'Impor data Excel';
const MAP_KEY = 'import.legacy';
const day = (s) => (s ? new Date(s + 'T00:00:00Z') : null);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

const admin = await prisma.user.findFirst({ where: { role: 'MANAJER_KEUANGAN', isActive: true }, orderBy: { createdAt: 'asc' } });
if (!admin) throw new Error('Belum ada akun Manajer Keuangan.');
const mapRow = await prisma.setting.findUnique({ where: { key: MAP_KEY } });
const map = { contracts: {}, ...(mapRow?.value ?? {}) };
const stat = { coparts: 0, contracts: 0, termins: 0, invoices: 0, payments: 0, skipped: 0 };

// ─── Copart ──────────────────────────────────────────────────────────────────
const contactId = {};
for (const c of data.coparts) {
  let row = await prisma.contact.findFirst({ where: { type: 'CLIENT', OR: [{ name: { equals: c.name, mode: 'insensitive' } }, { shortCode: c.shortCode }] } });
  if (!row) {
    const seq = await prisma.sequence.upsert({ where: { key: 'contact-CLIENT' }, create: { key: 'contact-CLIENT', value: 1 }, update: { value: { increment: 1 } } });
    row = await prisma.contact.create({ data: { code: `CP-${String(seq.value).padStart(4, '0')}`, type: 'CLIENT', name: c.name, shortCode: c.shortCode, paymentTermDays: 14 } });
    stat.coparts++;
  }
  contactId[c.shortCode] = row.id;
}

// ─── Presenter (master isian) ───────────────────────────────────────────────
const presenterCodes = [...new Set(data.contracts.flatMap((k) => k.presenters ?? []).map(normalizePresenter).filter(Boolean))];
for (const code of presenterCodes) await prisma.presenter.upsert({ where: { code }, create: { code }, update: {} });

// ─── Kontrak ─────────────────────────────────────────────────────────────────
for (const k of data.contracts) {
  if (map.contracts[k.key] && (await prisma.project.count({ where: { id: map.contracts[k.key] } }))) { stat.skipped++; continue; }
  const start = day(k.startDate ?? k.contractDate ?? data.generatedAt);
  const year = (day(k.contractDate) ?? start).getUTCFullYear();
  const seq = await prisma.sequence.upsert({ where: { key: 'project-' + year }, create: { key: 'project-' + year, value: 1 }, update: { value: { increment: 1 } } });
  const row = await prisma.project.create({
    data: {
      code: `KTR-${year}-${String(seq.value).padStart(3, '0')}`, name: k.standard ?? 'Kontrak lama', clientId: contactId[k.copart],
      serviceType: k.standard ? programGroup(k.standard) : 'LAINNYA', standard: k.standard, department: k.department,
      presenters: (k.presenters ?? []).map(normalizePresenter).filter(Boolean), fiscalYear: k.fiscalYear ?? null,
      contractValue: k.contractValue, contractDate: day(k.contractDate), startDate: start,
      status: k.status, description: k.description,
    },
  });
  map.contracts[k.key] = row.id;
  stat.contracts++;
}

// ─── Rencana termin ──────────────────────────────────────────────────────────
for (const t of data.termins) {
  const projectId = map.contracts[t.contract];
  const dueDate = day(t.dueDate);
  if (await prisma.projectMilestone.count({ where: { projectId, name: t.name, dueDate } })) { stat.skipped++; continue; }
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { contractValue: true, _count: { select: { milestones: true } } } });
  await prisma.projectMilestone.create({
    data: { projectId, sequence: project._count.milestones + 1, name: t.name, amount: t.amount, dueDate, notes: t.notes ?? null, percent: Number(project.contractValue) ? round2((t.amount / Number(project.contractValue)) * 100) : 0 },
  });
  stat.termins++;
}

// ─── Invoice akomodasi (Seri Operasional, tanpa PPN) ────────────────────────
let maxSeq = 0;
for (const inv of data.akomodasi) {
  if (await prisma.invoice.findUnique({ where: { number: inv.number } })) { stat.skipped++; continue; }
  const seqFree = inv.seq && !(await prisma.invoice.findUnique({ where: { series_seq: { series: 'OPS', seq: inv.seq } } }));
  const total = round2(inv.items.reduce((s, i) => s + i.amount, 0));
  const paid = round2(inv.payments.reduce((s, p) => s + p.amount, 0));
  const date = day(inv.date);
  // Jenis: transportasi / konsumsi bila seluruh uraiannya itu; selain itu akomodasi.
  const kinds = [...new Set(inv.items.map((i) => guessKind(i.description)))];
  const kind = kinds.length === 1 && ['TRANSPORTASI', 'KONSUMSI'].includes(kinds[0]) ? kinds[0] : 'AKOMODASI';
  await prisma.invoice.create({
    data: {
      number: inv.number, series: 'OPS', seq: seqFree ? inv.seq : null, docType: 'INVOICE', kind, category: kindCategory(kind), layout: 'JASA',
      projectId: inv.contract ? map.contracts[inv.contract] ?? null : null,
      clientId: contactId[inv.copart], date, dueDate: addDays(date, 14), items: inv.items.map((i) => ({ description: i.description, amount: i.amount })),
      taxMode: 'NONE', ppnRate: 0, subtotal: total, dpp: total, ppn: 0, total, paid: Math.min(paid, total), status: paymentStatus(total, Math.min(paid, total)),
      sentAt: date, sentVia: 'EMAIL', createdBy: admin.id, creatorName: ACTOR,
      payments: { create: inv.payments.map((p) => ({ date: day(p.date), account: 'OPS', amount: p.amount, notes: p.notes, createdBy: admin.id, creatorName: ACTOR })) },
    },
  });
  if (seqFree) maxSeq = Math.max(maxSeq, inv.seq);
  stat.invoices++;
  stat.payments += inv.payments.length;
}
// Nomor seri Operasional berikutnya tidak boleh bertabrakan dengan nomor impor.
// Bila belum ada urutan, mulai dari "Nomor berikutnya" di Pengaturan (nomor register Excel yang sudah terpakai).
if (maxSeq) {
  const key = sequenceKey('OPS');
  const { [seriesKey('OPS')]: cfg } = await getSettings([seriesKey('OPS')]);
  const floor = Math.max(maxSeq, Number(cfg.nextNumber || 1) - 1);
  const cur = await prisma.sequence.findUnique({ where: { key } });
  if (!cur || cur.value < floor) await prisma.sequence.upsert({ where: { key }, create: { key, value: floor }, update: { value: floor } });
}

await prisma.setting.upsert({ where: { key: MAP_KEY }, create: { key: MAP_KEY, value: { ...map, importedAt: new Date().toISOString() }, updatedBy: ACTOR }, update: { value: { ...map, importedAt: new Date().toISOString() }, updatedBy: ACTOR } });
await prisma.auditLog.create({ data: { actorName: ACTOR, action: 'CREATE', module: 'invoices', note: `Impor data Excel: ${JSON.stringify(stat)}` } });
console.log('Impor selesai:', stat);
await prisma.$disconnect();
