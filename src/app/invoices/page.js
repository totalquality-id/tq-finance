import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { query, requirePage } from '@/lib/page';
import { getSettings } from '@/lib/settings';
import { accountMapping, accountOptions } from '@/lib/services/ledger';
import { contactOptions } from '@/lib/services/contacts';
import { listInvoices } from '@/lib/services/invoices';
import InvoicesClient from './InvoicesClient';

export const metadata = { title: 'Piutang & Invoice' };

export default async function InvoicesPage({ searchParams }) {
  const user = await requirePage('/invoices');
  const q = await query(searchParams);
  const [data, clients, projects, taxes, accounts, map, settings] = await Promise.all([
    listInvoices(q, q),
    contactOptions(['CLIENT']),
    prisma.project.findMany({
      where: { status: { in: ['AKTIF', 'DITAHAN'] } },
      select: { id: true, code: true, name: true, clientId: true, contractNo: true, milestones: { where: { invoiceId: null }, orderBy: { sequence: 'asc' }, select: { id: true, name: true, amount: true, percent: true } } },
      orderBy: { code: 'desc' },
    }),
    prisma.tax.findMany({ where: { isActive: true, appliesTo: { in: ['SALES', 'BOTH'] } }, orderBy: { code: 'asc' } }),
    accountOptions({ type: { in: ['REVENUE', 'ASSET'] } }),
    accountMapping(),
    getSettings(['company.profile', 'invoice.print']),
  ]);
  return (
    <AppLayout title="Piutang & Invoice" user={user}>
      <InvoicesClient data={data} page={q.page} clients={clients} projects={projects} taxes={taxes}
        revenueAccounts={accounts.filter((a) => a.type === 'REVENUE' && a.normalBalance === 'CREDIT')} cashAccounts={accounts.filter((a) => a.isCash)}
        defaultRevenueId={map.revenue?.id ?? ''} company={settings['company.profile']} print={settings['invoice.print']}
        canEdit={canWrite(user.role, 'invoices')} />
    </AppLayout>
  );
}
