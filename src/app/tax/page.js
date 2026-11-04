import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { todayIso } from '@/lib/dates';
import { currentTab } from '@/lib/module-tabs';
import { query, requirePage } from '@/lib/page';
import { accountOptions } from '@/lib/services/ledger';
import { listTaxPayments, ppnRecap, taxPayables, withholdingRecap } from '@/lib/services/tax';
import TaxClient from './TaxClient';

export const metadata = { title: 'Pajak' };

export default async function TaxPage({ searchParams }) {
  const user = await requirePage('/tax');
  const q = await query(searchParams);
  const tab = currentTab('/tax', q.tab);
  const year = /^\d{4}$/.test(q.year ?? '') ? Number(q.year) : Number(todayIso().slice(0, 4));
  const now = todayIso().slice(0, 7);
  const period = /^\d{4}-\d{2}$/.test(q.period ?? '') ? q.period : now;
  let data;
  if (tab === 'ppn') data = await ppnRecap(year);
  else if (tab === 'withholding') data = await withholdingRecap(period);
  else data = { payments: await listTaxPayments({ year: String(year) }), payables: await taxPayables() };
  const accounts = tab === 'payments' ? await accountOptions() : [];
  return (
    <AppLayout title="Pajak" user={user}>
      <TaxClient tab={tab} data={data} year={year} period={period} accounts={accounts} canEdit={canWrite(user.role, 'tax')} />
    </AppLayout>
  );
}
