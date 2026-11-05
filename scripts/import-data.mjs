// Impor data awal (Copart, kontrak, rencana termin, invoice akomodasi) dari file JSON
// hasil scripts/private/prepare_import.py. Aman dijalankan ulang: data yang sudah ada dilewati.
//   node --env-file=<env> scripts/import-data.mjs <import.json>
import { readFileSync } from 'node:fs';
import { prisma } from '../src/lib/prisma.js';
import { paymentStatus, round2 } from '../src/lib/domain/billing.js';
import { sequenceKey } from '../src/lib/settings-defaults.js';

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
    row = await prisma.contact.create({ data: { code: `CP-${String(seq.value).padStart(4, '0')}`, type: 'CLIENT', name: c.name, shortCode: c.shortCode, paymentTermDays: 14, notes: ACTOR } });
    stat.coparts++;
  }
  contactId[c.shortCode] = row.id;
}

// ─── Kontrak ─────────────────────────────────────────────────────────────────
for (const k of data.contracts) {
  if (map.contracts[k.key] && (await prisma.project.count({ where: { id: map.contracts[k.key] } }))) { stat.skipped++; continue; }
  const start = day(k.startDate ?? k.contractDate ?? data.generatedAt);
  const year = (day(k.contractDate) ?? start).getUTCFullYear();
  const seq = await prisma.sequence.upsert({ where: { key: 'project-' + year }, create: { key: 'project-' + year, value: 1 }, update: { value: { increment: 1 } } });
  const row = await prisma.project.create({
    data: {
      code: `KTR-${year}-${String(seq.value).padStart(3, '0')}`, name: k.name, clientId: contactId[k.copart], serviceType: k.serviceType, standard: k.standard,
      department: k.department, presenter: k.presenter, contractValue: k.contractValue, contractDate: day(k.contractDate), startDate: start,
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
    data: { projectId, sequence: project._count.milestones + 1, name: t.name, amount: t.amount, dueDate, percent: Number(project.contractValue) ? round2((t.amount / Number(project.contractValue)) * 100) : 0 },
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
  await prisma.invoice.create({
    data: {
      number: inv.number, series: 'OPS', seq: seqFree ? inv.seq : null, docType: 'INVOICE', category: 'AKOMODASI', layout: 'JASA',
      clientId: contactId[inv.copart], date, dueDate: addDays(date, 14), items: inv.items.map((i) => ({ description: i.description, amount: i.amount })),
      taxMode: 'NONE', ppnRate: 0, subtotal: total, dpp: total, ppn: 0, total, paid: Math.min(paid, total), status: paymentStatus(total, Math.min(paid, total)),
      internalNote: ACTOR, sentAt: date, sentVia: 'EMAIL', createdBy: admin.id, creatorName: ACTOR,
      payments: { create: inv.payments.map((p) => ({ date: day(p.date), account: 'OPS', amount: p.amount, notes: p.notes, createdBy: admin.id, creatorName: ACTOR })) },
    },
  });
  if (seqFree) maxSeq = Math.max(maxSeq, inv.seq);
  stat.invoices++;
  stat.payments += inv.payments.length;
}
// Nomor seri Operasional berikutnya tidak boleh bertabrakan dengan nomor impor.
if (maxSeq) {
  const key = sequenceKey('OPS');
  const cur = await prisma.sequence.findUnique({ where: { key } });
  if (!cur || cur.value < maxSeq) await prisma.sequence.upsert({ where: { key }, create: { key, value: maxSeq }, update: { value: maxSeq } });
}

await prisma.setting.upsert({ where: { key: MAP_KEY }, create: { key: MAP_KEY, value: { ...map, importedAt: new Date().toISOString() }, updatedBy: ACTOR }, update: { value: { ...map, importedAt: new Date().toISOString() }, updatedBy: ACTOR } });
await prisma.auditLog.create({ data: { actorName: ACTOR, action: 'CREATE', module: 'invoices', note: `Impor data Excel: ${JSON.stringify(stat)}` } });
console.log('Impor selesai:', stat);
await prisma.$disconnect();
