import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { query, requirePage } from '@/lib/page';
import { accountOptions } from '@/lib/services/ledger';
import { cashAccounts, listCash } from '@/lib/services/cash';
import { projectOptions } from '@/lib/services/projects';
import CashClient from './CashClient';

export const metadata = { title: 'Kas & Bank' };

export default async function CashPage({ searchParams }) {
  const user = await requirePage('/cash');
  const q = await query(searchParams);
  const [data, balances, accounts, projects] = await Promise.all([listCash(q, q), cashAccounts(), accountOptions(), projectOptions()]);
  return (
    <AppLayout title="Kas & Bank" user={user}>
      <CashClient data={data} page={q.page} balances={balances} accounts={accounts} projects={projects} canEdit={canWrite(user.role, 'cash')} />
    </AppLayout>
  );
}
