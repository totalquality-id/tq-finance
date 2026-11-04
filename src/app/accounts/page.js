import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { requirePage } from '@/lib/page';
import { listAccounts } from '@/lib/services/accounts';
import AccountsClient from './AccountsClient';

export const metadata = { title: 'Bagan Akun' };

export default async function AccountsPage() {
  const user = await requirePage('/accounts');
  const accounts = await listAccounts();
  return (
    <AppLayout title="Bagan Akun" user={user}>
      <AccountsClient accounts={accounts} canEdit={canWrite(user.role, 'accounts')} />
    </AppLayout>
  );
}
