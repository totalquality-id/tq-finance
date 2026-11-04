import AppLayout from '@/components/AppLayout';
import { requirePage } from '@/lib/page';
import { dashboard } from '@/lib/services/dashboard';
import { maybeRunReminders } from '@/lib/services/reminders';
import DashboardClient from './DashboardClient';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const user = await requirePage('/dashboard');
  await maybeRunReminders();
  const data = await dashboard();
  return (
    <AppLayout title="Dashboard" user={user}>
      <DashboardClient data={data} />
    </AppLayout>
  );
}
