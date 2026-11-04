import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { query, requirePage } from '@/lib/page';
import { accountMapping, accountOptions } from '@/lib/services/ledger';
import { contactOptions } from '@/lib/services/contacts';
import { listBills } from '@/lib/services/bills';
import { projectOptions } from '@/lib/services/projects';
import BillsClient from './BillsClient';

export const metadata = { title: 'Hutang & Tagihan' };

export default async function BillsPage({ searchParams }) {
  const user = await requirePage('/bills');
  const q = await query(searchParams);
  const [data, vendors, projects, taxes, accounts, map] = await Promise.all([
    listBills(q, q),
    contactOptions(['VENDOR', 'ASSOCIATE']),
    projectOptions(),
    prisma.tax.findMany({ where: { isActive: true, appliesTo: { in: ['PURCHASE', 'BOTH'] } }, orderBy: { code: 'asc' } }),
    accountOptions(),
    accountMapping(),
  ]);
  return (
    <AppLayout title="Hutang & Tagihan" user={user}>
      <BillsClient data={data} page={q.page} vendors={vendors} projects={projects} taxes={taxes}
        expenseAccounts={accounts.filter((a) => ['COST', 'EXPENSE', 'OTHER_EXPENSE', 'ASSET'].includes(a.type) && !a.isCash)}
        cashAccounts={accounts.filter((a) => a.isCash)} defaultExpenseId={map.expense?.id ?? ''} canEdit={canWrite(user.role, 'bills')} />
    </AppLayout>
  );
}
