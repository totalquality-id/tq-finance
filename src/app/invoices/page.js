import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { query, requirePage } from '@/lib/page';
import { getSettings } from '@/lib/settings';
import { contactOptions } from '@/lib/services/contacts';
import { listInvoices } from '@/lib/services/invoices';
import InvoicesClient from './InvoicesClient';

export const metadata = { title: 'Invoice' };

export default async function InvoicesPage({ searchParams }) {
  const user = await requirePage('/invoices');
  const q = await query(searchParams);
  const [data, clients, projects, settings] = await Promise.all([
    listInvoices(q, q),
    contactOptions(),
    prisma.project.findMany({
      where: { status: { in: ['MENUNGGU_DP', 'AKTIF', 'DITAHAN'] } },
      select: { id: true, code: true, name: true, standard: true, clientId: true, contractNo: true, spkNo: true, milestones: { where: { invoiceId: null }, orderBy: { sequence: 'asc' }, select: { id: true, name: true, amount: true, sequence: true } }, _count: { select: { milestones: true } } },
      orderBy: { code: 'desc' },
    }),
    getSettings(['invoice.document', 'invoice.seriesTQ', 'invoice.seriesOPS', 'reminder.thresholds']),
  ]);
  const bank = (s) => [s.bankName, s.bankAccount].filter(Boolean).join(' · ') || 'Rekening belum diatur';
  return (
    <AppLayout title="Invoice" user={user}>
      <InvoicesClient data={data} page={q.page} clients={clients} projects={projects}
        doc={settings['invoice.document']} banks={{ TQ: bank(settings['invoice.seriesTQ']), OPS: bank(settings['invoice.seriesOPS']) }}
        canEdit={canWrite(user.role, 'invoices')} />
    </AppLayout>
  );
}
