import { api, json, params } from '@/lib/http';
import { addInvoicePayment } from '@/lib/services/invoices';
export const POST = api(async (request, context, user) => addInvoicePayment(user, (await params(context)).id, await json(request)));
