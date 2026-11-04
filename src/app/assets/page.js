import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { query, requirePage } from '@/lib/page';
import { accountOptions } from '@/lib/services/ledger';
import { listAssets } from '@/lib/services/assets';
import AssetsClient from './AssetsClient';

export const metadata = { title: 'Aset Tetap' };

export default async function AssetsPage({ searchParams }) {
  const user = await requirePage('/assets');
  const q = await query(searchParams);
  const [assets, accounts] = await Promise.all([listAssets(q), accountOptions()]);
  return (
    <AppLayout title="Aset Tetap" user={user}>
      <AssetsClient assets={assets} accounts={accounts} canEdit={canWrite(user.role, 'assets')} />
    </AppLayout>
  );
}
