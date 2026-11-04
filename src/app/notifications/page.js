import AppLayout from '@/components/AppLayout';
import { query, requirePage } from '@/lib/page';
import { listNotifications } from '@/lib/services/inbox';
import { maybeRunReminders } from '@/lib/services/reminders';
import NotificationsClient from './NotificationsClient';

export const metadata = { title: 'Notifikasi' };

export default async function NotificationsPage({ searchParams }) {
  const user = await requirePage('/notifications');
  const q = await query(searchParams);
  await maybeRunReminders();
  const data = await listNotifications(user, q, q);
  return (
    <AppLayout title="Notifikasi" user={user}>
      <NotificationsClient data={data} page={q.page} />
    </AppLayout>
  );
}
