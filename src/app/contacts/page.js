import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { currentTab } from '@/lib/module-tabs';
import { query, requirePage } from '@/lib/page';
import { listContacts } from '@/lib/services/contacts';
import ContactsClient from './ContactsClient';

export const metadata = { title: 'Copart & Vendor' };

export default async function ContactsPage({ searchParams }) {
  const user = await requirePage('/contacts');
  const q = await query(searchParams);
  const tab = currentTab('/contacts', q.tab);
  const data = await listContacts({ ...q, tab }, q);
  return (
    <AppLayout title="Copart & Vendor" user={user}>
      <ContactsClient data={data} tab={tab} page={q.page} canEdit={canWrite(user.role, 'contacts')} />
    </AppLayout>
  );
}
