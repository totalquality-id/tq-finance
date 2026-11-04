import { api, json } from '@/lib/http';
import { createInvoice, listInvoices } from '@/lib/services/invoices';
export const GET = api(async (request) => listInvoices(Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => createInvoice(user, await json(request)));
