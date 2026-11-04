import { prisma } from '../prisma.js';
import { audit, diff } from '../audit.js';
import { ACCOUNT_TYPES, NORMAL_BALANCE, round2, signed } from '../domain/accounting.js';
import { getSettings } from '../settings.js';
import { bool, choice, ensure, int, object, text } from '../validation.js';

/** Saldo semua akun detail s.d. tanggal (opsional) dalam bentuk peta id → {debit, credit}. */
export async function balancesByAccount({ to, from, projectId } = {}, db = prisma) {
  const where = {};
  if (from || to) where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  if (projectId) where.projectId = projectId;
  const rows = await db.journalLine.groupBy({ by: ['accountId'], where, _sum: { debit: true, credit: true } });
  return Object.fromEntries(rows.map((r) => [r.accountId, { debit: Number(r._sum.debit ?? 0), credit: Number(r._sum.credit ?? 0) }]));
}

export async function listAccounts() {
  const [accounts, bal] = await Promise.all([prisma.account.findMany({ orderBy: { code: 'asc' } }), balancesByAccount()]);
  // Saldo grup = jumlah akun detail dengan awalan kode grup (kode hirarkis 1000 → 11xx → 1101).
  const rows = accounts.map((a) => {
    const b = bal[a.id] ?? { debit: 0, credit: 0 };
    return { ...a, debit: b.debit, credit: b.credit, balance: round2(signed(a.normalBalance, b.debit, b.credit)), used: Boolean(bal[a.id]) };
  });
  const prefix = (code) => code.replace(/0+$/, '');
  for (const g of rows.filter((r) => r.isGroup)) {
    const p = prefix(g.code);
    const kids = rows.filter((r) => !r.isGroup && r.code.startsWith(p) && r.type === g.type);
    g.balance = round2(kids.reduce((s, k) => s + signed(g.normalBalance, k.debit, k.credit), 0));
  }
  return rows;
}

function parse(body) {
  object(body, ['code', 'name', 'type', 'normalBalance', 'isGroup', 'level', 'isCash', 'isActive', 'description']);
  const type = choice(body.type, ACCOUNT_TYPES, 'Tipe akun');
  const data = {
    code: text(body.code, 'Kode akun', 12),
    name: text(body.name, 'Nama akun', 120),
    type,
    normalBalance: choice(body.normalBalance || NORMAL_BALANCE[type], ['DEBIT', 'CREDIT'], 'Saldo normal'),
    isGroup: bool(body.isGroup),
    level: int(body.level ?? 3, 'Level', 1, 4),
    isCash: bool(body.isCash),
    isActive: body.isActive === undefined ? true : bool(body.isActive),
    description: text(body.description, 'Keterangan', 300, true),
  };
  ensure(/^[0-9A-Za-z.-]+$/.test(data.code), 'Kode akun hanya angka/huruf/titik.');
  ensure(!(data.isCash && (data.isGroup || type !== 'ASSET')), 'Akun kas/bank harus akun detail bertipe Aset.');
  return data;
}

export async function saveAccount(user, id, body) {
  const data = parse(body);
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.account.findUnique({ where: { id } }) : null;
    if (id) {
      ensure(before, 'Akun tidak ditemukan.', 404);
      if (data.isGroup && !before.isGroup) ensure((await tx.journalLine.count({ where: { accountId: id } })) === 0, 'Akun sudah memiliki transaksi, tidak dapat dijadikan grup.');
    }
    const row = id ? await tx.account.update({ where: { id }, data }) : await tx.account.create({ data });
    await audit(tx, user, { action: id ? 'UPDATE' : 'CREATE', module: 'accounts', recordId: row.id, ...(id ? diff(before, data) : { after: data }) });
    return row;
  });
}

export async function deleteAccount(user, id) {
  const acc = await prisma.account.findUnique({ where: { id } });
  ensure(acc, 'Akun tidak ditemukan.', 404);
  ensure((await prisma.journalLine.count({ where: { accountId: id } })) === 0, 'Akun sudah dipakai jurnal; nonaktifkan saja.', 409);
  const { 'accounts.mapping': map } = await getSettings(['accounts.mapping']);
  ensure(!Object.values(map).includes(acc.code), 'Akun dipakai di pemetaan akun default.', 409);
  return prisma.$transaction(async (tx) => {
    await tx.account.delete({ where: { id } });
    await audit(tx, user, { action: 'DELETE', module: 'accounts', recordId: id, before: acc });
    return { ok: true };
  });
}
