import AppLayout from '@/components/AppLayout';
import { requirePage } from '@/lib/page';
import AccountClient from './AccountClient';

export const metadata = { title: 'Akun Saya' };

export default async function AccountPage() {
  const user = await requirePage('/account');
  return (
    <AppLayout title="Akun Saya" user={user}>
      <AccountClient user={user} />
    </AppLayout>
  );
}
