import AppLayout from '@/components/AppLayout';
import { requirePage } from '@/lib/page';
import { listUsers } from '@/lib/services/users';
import UsersClient from './UsersClient';

export const metadata = { title: 'Pengguna' };

export default async function UsersPage() {
  const user = await requirePage('/users');
  const users = await listUsers();
  return (
    <AppLayout title="Pengguna" user={user}>
      <UsersClient users={users} />
    </AppLayout>
  );
}
