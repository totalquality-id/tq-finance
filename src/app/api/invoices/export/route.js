import { api } from '@/lib/http';
import { todayIso } from '@/lib/dates';
import { exportInvoices } from '@/lib/services/invoices';
import { xlsxResponse } from '@/lib/services/reports';
export const GET = api(async (request, context, user) => xlsxResponse(await exportInvoices(user, Object.fromEntries(new URL(request.url).searchParams)), 'Rekap-Invoice-' + todayIso() + '.xlsx'));
