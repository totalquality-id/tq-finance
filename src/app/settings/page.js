import AppLayout from '@/components/AppLayout';
import { requirePage } from '@/lib/page';
import { invoiceAssets } from '@/lib/settings';
import { listSettings } from '@/lib/services/settings-admin';
import SettingsClient from './SettingsClient';

export const metadata = { title: 'Pengaturan' };

export default async function SettingsPage() {
  const user = await requirePage('/settings');
  const [settings, assets] = await Promise.all([listSettings(), invoiceAssets()]);
  return (
    <AppLayout title="Pengaturan" user={user}>
      <SettingsClient settings={settings} assets={assets} canEdit={user.role === 'MANAJER_KEUANGAN'} />
    </AppLayout>
  );
}
