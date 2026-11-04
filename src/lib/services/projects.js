import { prisma } from '../prisma.js';
import { audit, diff } from '../audit.js';
import { round2 } from '../domain/accounting.js';
import { array, choice, ensure, id as idOf, number, object, optionalDate, date, text } from '../validation.js';
import { searchOr } from './common.js';

export const SERVICE_TYPES = ['KONSULTANSI', 'AUDIT', 'PELATIHAN', 'SERTIFIKASI', 'ELEARNING', 'LAINNYA'];
export const PROJECT_STATUSES = ['AKTIF', 'DITAHAN', 'SELESAI', 'BATAL'];

/** Ringkasan keuangan per proyek dari buku besar + dokumen. */
export async function projectFinancials(ids, { from, to } = {}) {
  if (!ids.length) return {};
  const dateWhere = from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
  const [lines, accounts, inv] = await Promise.all([
    prisma.journalLine.groupBy({ by: ['projectId', 'accountId'], where: { projectId: { in: ids }, ...dateWhere }, _sum: { debit: true, credit: true } }),
    prisma.account.findMany({ select: { id: true, type: true } }),
    prisma.invoice.groupBy({ by: ['projectId'], where: { projectId: { in: ids }, status: { not: 'VOID' }, ...dateWhere }, _sum: { subtotal: true, discount: true, total: true, paid: true } }),
  ]);
  const type = Object.fromEntries(accounts.map((a) => [a.id, a.type]));
  const out = Object.fromEntries(ids.map((i) => [i, { revenue: 0, directCost: 0, overhead: 0, invoiced: 0, billed: 0, collected: 0 }]));
  for (const l of lines) {
    const d = Number(l._sum.debit ?? 0), c = Number(l._sum.credit ?? 0), o = out[l.projectId];
    const t = type[l.accountId];
    if (t === 'REVENUE' || t === 'OTHER_INCOME') o.revenue += c - d;
    else if (t === 'COST') o.directCost += d - c;
    else if (t === 'EXPENSE' || t === 'OTHER_EXPENSE') o.overhead += d - c;
  }
  for (const r of inv) {
    const o = out[r.projectId];
    o.invoiced = round2(Number(r._sum.subtotal ?? 0) - Number(r._sum.discount ?? 0));
    o.billed = Number(r._sum.total ?? 0);
    o.collected = Number(r._sum.paid ?? 0);
  }
  for (const o of Object.values(out)) {
    o.revenue = round2(o.revenue); o.directCost = round2(o.directCost); o.overhead = round2(o.overhead);
    o.margin = round2(o.revenue - o.directCost - o.overhead);
    o.marginPct = o.revenue ? round2((o.margin / o.revenue) * 100) : 0;
  }
  return out;
}

export async function listProjects(f = {}, { skip = 0, take = 50 } = {}) {
  const where = {};
  if (PROJECT_STATUSES.includes(f.status)) where.status = f.status;
  if (SERVICE_TYPES.includes(f.serviceType)) where.serviceType = f.serviceType;
  if (f.clientId) where.clientId = String(f.clientId);
  const or = searchOr(f.q, ['name', 'code', 'contractNo', 'client.name', 'standard']);
  if (or) where.OR = or;
  const [rows, total] = await Promise.all([
    prisma.project.findMany({
      where, skip, take, orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
      include: {
        client: { select: { id: true, name: true, code: true } },
        milestones: { orderBy: { sequence: 'asc' }, include: { invoice: { select: { id: true, number: true, status: true } } } },
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
    select: { id: true, code: true, name: true, clientId: true, contractValue: true },
    orderBy: { code: 'desc' },
  });
}

function parse(body) {
  object(body, ['name', 'clientId', 'serviceType', 'standard', 'contractNo', 'contractDate', 'contractValue', 'budgetCost', 'startDate', 'endDate', 'manager', 'status', 'description', 'milestones']);
  const data = {
    name: text(body.name, 'Nama proyek', 200),
    clientId: idOf(body.clientId, 'Klien'),
    serviceType: choice(body.serviceType, SERVICE_TYPES, 'Jenis jasa'),
    standard: text(body.standard, 'Standar', 120, true),
    contractNo: text(body.contractNo, 'No. kontrak/SPK', 80, true),
    contractDate: optionalDate(body.contractDate, 'Tanggal kontrak'),
    contractValue: number(body.contractValue ?? 0, 'Nilai kontrak', 0),
    budgetCost: number(body.budgetCost ?? 0, 'Anggaran biaya', 0),
    startDate: date(body.startDate, 'Tanggal mulai'),
    endDate: optionalDate(body.endDate, 'Tanggal selesai'),
    manager: text(body.manager, 'Penanggung jawab', 120, true),
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
  ensure(await prisma.contact.count({ where: { id: data.clientId, type: 'CLIENT' } }), 'Klien tidak ditemukan.');
  return prisma.$transaction(async (tx) => {
    let row, before = null;
    if (id) {
      before = await tx.project.findUnique({ where: { id }, include: { milestones: true } });
      ensure(before, 'Proyek tidak ditemukan.', 404);
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
      const code = `PRJ-${year}-${String(seq.value).padStart(3, '0')}`;
      row = await tx.project.create({ data: { ...data, code, milestones: { create: milestones.map(({ id: _id, ...m }) => m) } } });
    }
    await audit(tx, user, { action: id ? 'UPDATE' : 'CREATE', module: 'projects', recordId: row.id, ...(id ? diff(before, data) : { after: { code: row.code, ...data, milestones: milestones.length } }) });
    return row;
  });
}
