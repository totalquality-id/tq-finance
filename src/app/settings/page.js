import AppLayout from '@/components/AppLayout';
import { requirePage } from '@/lib/page';
import { lockDate } from '@/lib/settings';
import { accountOptions } from '@/lib/services/ledger';
import { listSettings, listTaxes } from '@/lib/services/settings-admin';
import SettingsClient from './SettingsClient';

export const metadata = { title: 'Pengaturan' };

export default async function SettingsPage() {
  const user = await requirePage('/settings');
  const [settings, taxes, accounts, lock] = await Promise.all([listSettings(), listTaxes(), accountOptions(), lockDate()]);
  return (
    <AppLayout title="Pengaturan" user={user}>
      <SettingsClient settings={settings} taxes={taxes} accounts={accounts} lock={lock} canEdit={user.role === 'MANAJER_KEUANGAN'} />
    </AppLayout>
  );
}
