import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { query, requirePage } from '@/lib/page';
import { billingMonitor } from '@/lib/services/reports';
import BillingClient from './BillingClient';

export const metadata = { title: 'Monitoring Penagihan' };

export default async function BillingPage({ searchParams }) {
  const user = await requirePage('/billing');
  const q = await query(searchParams);
  const data = await billingMonitor(q);
  return (
    <AppLayout title="Monitoring Penagihan" user={user}>
      <BillingClient data={data} canEdit={canWrite(user.role, 'projects')} />
    </AppLayout>
  );
}
