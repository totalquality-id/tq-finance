import AppLayout from '@/components/AppLayout';
import { currentTab } from '@/lib/module-tabs';
import { query, requirePage } from '@/lib/page';
import { getSettings } from '@/lib/settings';
import { accountOptions } from '@/lib/services/ledger';
import { projectOptions } from '@/lib/services/projects';
import { report } from '@/lib/services/reports';
import ReportsClient from './ReportsClient';

export const metadata = { title: 'Laporan Keuangan' };

export default async function ReportsPage({ searchParams }) {
  const user = await requirePage('/reports');
  const q = await query(searchParams);
  const tab = currentTab('/reports', q.tab);
  const [data, accounts, projects, settings] = await Promise.all([
    report(tab, q),
    tab === 'gl' || tab === 'daily' ? accountOptions() : [],
    tab === 'pl' ? projectOptions({ activeOnly: false }) : [],
    getSettings(['company.profile']),
  ]);
  return (
    <AppLayout title="Laporan Keuangan" user={user}>
      <ReportsClient tab={tab} data={data} accounts={accounts} projects={projects} company={settings['company.profile']} />
    </AppLayout>
  );
}
