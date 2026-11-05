import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { query, requirePage } from '@/lib/page';
import { listContacts } from '@/lib/services/contacts';
import ContactsClient from './ContactsClient';

export const metadata = { title: 'Copart' };

export default async function ContactsPage({ searchParams }) {
  const user = await requirePage('/contacts');
  const q = await query(searchParams);
  const data = await listContacts(q, q);
  return (
    <AppLayout title="Copart" user={user}>
      <ContactsClient data={data} page={q.page} canEdit={canWrite(user.role, 'contacts')} />
    </AppLayout>
  );
}
