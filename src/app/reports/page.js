import AppLayout from '@/components/AppLayout';
import { currentTab } from '@/lib/module-tabs';
import { query, requirePage } from '@/lib/page';
import { getSettings } from '@/lib/settings';
import { report } from '@/lib/services/reports';
import ReportsClient from './ReportsClient';

export const metadata = { title: 'Laporan Penagihan' };

export default async function ReportsPage({ searchParams }) {
  const user = await requirePage('/reports');
  const q = await query(searchParams);
  const tab = currentTab('/reports', q.tab);
  const [data, settings] = await Promise.all([report(tab, q), getSettings(['company.profile'])]);
  return (
    <AppLayout title="Laporan Penagihan" user={user}>
      <ReportsClient tab={tab} data={data} company={settings['company.profile']} />
    </AppLayout>
  );
}
