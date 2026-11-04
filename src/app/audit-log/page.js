import AppLayout from '@/components/AppLayout';
import { query, requirePage } from '@/lib/page';
import { listAudit } from '@/lib/services/settings-admin';
import AuditClient from './AuditClient';

export const metadata = { title: 'Audit Log' };

export default async function AuditPage({ searchParams }) {
  const user = await requirePage('/audit-log');
  const q = await query(searchParams);
  const data = await listAudit(q, q);
  return (
    <AppLayout title="Audit Log" user={user}>
      <AuditClient data={data} page={q.page} />
    </AppLayout>
  );
}
