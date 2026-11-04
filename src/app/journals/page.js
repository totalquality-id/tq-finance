import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { query, requirePage } from '@/lib/page';
import { lockDate } from '@/lib/settings';
import { accountOptions } from '@/lib/services/ledger';
import { listJournals } from '@/lib/services/journals';
import { projectOptions } from '@/lib/services/projects';
import JournalsClient from './JournalsClient';

export const metadata = { title: 'Jurnal Umum' };

export default async function JournalsPage({ searchParams }) {
  const user = await requirePage('/journals');
  const q = await query(searchParams);
  const [data, accounts, projects, lock] = await Promise.all([listJournals(q, q), accountOptions(), projectOptions({ activeOnly: false }), lockDate()]);
  return (
    <AppLayout title="Jurnal Umum" user={user}>
      <JournalsClient data={data} page={q.page} accounts={accounts} projects={projects} lock={lock} canEdit={canWrite(user.role, 'journals')} />
    </AppLayout>
  );
}
