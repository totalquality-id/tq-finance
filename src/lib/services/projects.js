import { prisma } from '../prisma.js';
import { audit, diff } from '../audit.js';
import { DEPARTMENTS, round2 } from '../domain/billing.js';
import { array, choice, ensure, id as idOf, number, object, optionalChoice, optionalDate, date, text } from '../validation.js';
import { searchOr } from './common.js';

export const SERVICE_TYPES = ['SYSTEM', 'PROJECT', 'TRAINING', 'AUDIT', 'LAINNYA'];
export const PROJECT_STATUSES = ['AKTIF', 'DITAHAN', 'SELESAI', 'BATAL'];

/** Ringkasan penagihan per kontrak: nilai diinvoice (sebelum PPN) dan diterima. */
export async function projectFinancials(ids, { from, to } = {}) {
  if (!ids.length) return {};
  const dateWhere = from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
  const inv = await prisma.invoice.groupBy({ by: ['projectId'], where: { projectId: { in: ids }, status: { not: 'VOID' }, ...dateWhere }, _sum: { subtotal: true, total: true, paid: true } });
  const out = Object.fromEntries(ids.map((i) => [i, { invoiced: 0, billed: 0, collected: 0 }]));
  for (const r of inv) out[r.projectId] = { invoiced: Number(r._sum.subtotal ?? 0), billed: Number(r._sum.total ?? 0), collected: Number(r._sum.paid ?? 0) };
  for (const o of Object.values(out)) o.outstanding = round2(o.billed - o.collected);
  return out;
}

export async function listProjects(f = {}, { skip = 0, take = 50 } = {}) {
  const where = {};
  if (PROJECT_STATUSES.includes(f.status)) where.status = f.status;
  if (SERVICE_TYPES.includes(f.serviceType)) where.serviceType = f.serviceType;
  if (f.clientId) where.clientId = String(f.clientId);
  if (DEPARTMENTS.includes(f.department)) where.department = f.department;
  const or = searchOr(f.q, ['name', 'code', 'contractNo', 'spkNo', 'client.name', 'standard', 'presenter']);
  if (or) where.OR = or;
  const [rows, total] = await Promise.all([
    prisma.project.findMany({
      where, skip, take, orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
      include: {
        client: { select: { id: true, name: true, code: true } },
        milestones: { orderBy: { sequence: 'asc' }, include: { invoice: { select: { id: true, number: true, status: true, date: true, total: true, paid: true } } } },
      },
    }),
    prisma.project.count({ where }),
  ]);
  const fin = await projectFinancials(rows.map((r) => r.id));
  return { rows: rows.map((r) => ({ ...r, fin: fin[r.id] })), total };
}

export function projectOptions({ activeOnly = true } = {}) {
  return prisma.project.findMany({
    where: activeOnly ? { status: { in: ['AKTIF', 'DITAHAN'] } } : {},
    select: { id: true, code: true, name: true, clientId: true, contractValue: true, contractNo: true, spkNo: true },
    orderBy: { code: 'desc' },
  });
}

function parse(body) {
  object(body, ['name', 'clientId', 'serviceType', 'standard', 'department', 'presenter', 'contractNo', 'spkNo', 'contractDate', 'contractValue', 'startDate', 'endDate', 'manager', 'status', 'description', 'milestones']);
  const data = {
    name: text(body.name, 'Nama kontrak', 200),
    clientId: idOf(body.clientId, 'Copart'),
    serviceType: choice(body.serviceType, SERVICE_TYPES, 'Kelompok program'),
    standard: text(body.standard, 'Program', 150, true),
    department: optionalChoice(body.department, DEPARTMENTS, 'Departemen'),
    presenter: text(body.presenter, 'Presenter', 80, true),
    contractNo: text(body.contractNo, 'No. kontrak', 80, true),
    spkNo: text(body.spkNo, 'No. SPK', 80, true),
    contractDate: optionalDate(body.contractDate, 'Tanggal kontrak'),
    contractValue: number(body.contractValue ?? 0, 'Nilai kontrak', 0),
    startDate: date(body.startDate, 'Tanggal mulai'),
    endDate: optionalDate(body.endDate, 'Tanggal selesai'),
    manager: text(body.manager, 'SDO pelaksana', 120, true),
    status: choice(body.status ?? 'AKTIF', PROJECT_STATUSES, 'Status'),
    description: text(body.description, 'Keterangan', 2000, true),
  };
  ensure(!data.endDate || data.endDate >= data.startDate, 'Tanggal selesai sebelum tanggal mulai.');
  const milestones = (body.milestones?.length ? array(body.milestones, 'Termin', 24) : []).map((m, i) => ({
    id: m.id || null,
    sequence: i + 1,
    name: text(m.name, `Nama termin ${i + 1}`, 120),
    percent: number(m.percent ?? 0, `Persen termin ${i + 1}`, 0, 100),
    amount: number(m.amount ?? 0, `Nilai termin ${i + 1}`, 0),
    dueDate: optionalDate(m.dueDate, `Jatuh tempo termin ${i + 1}`),
  }));
  const sum = round2(milestones.reduce((s, m) => s + m.amount, 0));
  ensure(!milestones.length || sum <= data.contractValue + 0.5, `Total termin (${sum}) melebihi nilai kontrak.`);
  return { data, milestones };
}

export async function saveProject(user, id, body) {
  const { data, milestones } = parse(body);
  ensure(await prisma.contact.count({ where: { id: data.clientId, type: 'CLIENT' } }), 'Copart tidak ditemukan.');
  return prisma.$transaction(async (tx) => {
    let row, before = null;
    if (id) {
      before = await tx.project.findUnique({ where: { id }, include: { milestones: true } });
      ensure(before, 'Kontrak tidak ditemukan.', 404);
      row = await tx.project.update({ where: { id }, data });
      const keep = new Set(milestones.filter((m) => m.id).map((m) => m.id));
      for (const m of before.milestones) {
        if (!keep.has(m.id)) {
          ensure(!m.invoiceId, `Termin "${m.name}" sudah diinvoice, tidak dapat dihapus.`);
          await tx.projectMilestone.delete({ where: { id: m.id } });
        }
      }
      for (const m of milestones) {
        const { id: mid, ...md } = m;
        const old = before.milestones.find((x) => x.id === mid);
        if (old) {
          ensure(!old.invoiceId || Math.abs(Number(old.amount) - md.amount) < 0.01, `Nilai termin "${old.name}" sudah diinvoice dan tidak dapat diubah.`);
          await tx.projectMilestone.update({ where: { id: mid }, data: md });
        } else await tx.projectMilestone.create({ data: { ...md, projectId: id } });
      }
    } else {
      const year = data.startDate.getUTCFullYear();
      const seq = await tx.sequence.upsert({ where: { key: 'project-' + year }, create: { key: 'project-' + year, value: 1 }, update: { value: { increment: 1 } } });
      const code = `KTR-${year}-${String(seq.value).padStart(3, '0')}`;
      row = await tx.project.create({ data: { ...data, code, milestones: { create: milestones.map(({ id: _id, ...m }) => m) } } });
    }
    await audit(tx, user, { action: id ? 'UPDATE' : 'CREATE', module: 'projects', recordId: row.id, ...(id ? diff(before, data) : { after: { code: row.code, ...data, milestones: milestones.length } }) });
    return row;
  });
}

// ─── Ubah / hapus satu termin (dari Monitoring Penagihan) ───────────────────
export async function updateMilestone(user, id, body) {
  object(body, ['name', 'amount', 'dueDate']);
  const before = await prisma.projectMilestone.findUnique({ where: { id }, include: { project: { select: { contractValue: true, milestones: { select: { id: true, amount: true } } } } } });
  ensure(before, 'Termin tidak ditemukan.', 404);
  const data = { name: text(body.name, 'Nama termin', 120), amount: number(body.amount, 'Nominal', 0), dueDate: date(body.dueDate, 'Rencana tagih') };
  if (before.invoiceId) ensure(Math.abs(Number(before.amount) - data.amount) < 0.01, 'Termin sudah diinvoice; nominal mengikuti invoice dan tidak dapat diubah di sini.');
  const others = before.project.milestones.filter((m) => m.id !== id).reduce((s, m) => s + Number(m.amount), 0);
  const value = Number(before.project.contractValue);
  ensure(round2(others + data.amount) <= value + 0.5, `Total termin melebihi nilai kontrak (${value}). Ubah nilai kontrak terlebih dahulu.`);
  if (value) data.percent = round2((data.amount / value) * 100);
  return prisma.$transaction(async (tx) => {
    const row = await tx.projectMilestone.update({ where: { id }, data });
    await audit(tx, user, { action: 'UPDATE', module: 'projects', recordId: before.projectId, ...diff(before, data), note: 'Ubah termin ' + before.name });
    return row;
  });
}

export async function deleteMilestone(user, id) {
  const m = await prisma.projectMilestone.findUnique({ where: { id } });
  ensure(m, 'Termin tidak ditemukan.', 404);
  ensure(!m.invoiceId, 'Termin sudah diinvoice. Batalkan invoicenya terlebih dahulu bila termin ini memang tidak berlaku.', 409);
  return prisma.$transaction(async (tx) => {
    await tx.projectMilestone.delete({ where: { id } });
    const rest = await tx.projectMilestone.findMany({ where: { projectId: m.projectId }, orderBy: { sequence: 'asc' } });
    for (const [i, r] of rest.entries()) if (r.sequence !== i + 1) await tx.projectMilestone.update({ where: { id: r.id }, data: { sequence: i + 1 } });
    await audit(tx, user, { action: 'DELETE', module: 'projects', recordId: m.projectId, before: { name: m.name, amount: m.amount, dueDate: m.dueDate }, note: 'Hapus termin' });
    return { ok: true };
  });
}
