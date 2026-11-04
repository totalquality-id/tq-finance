import { api, json, params } from '@/lib/http';
import { updateInvoice } from '@/lib/services/invoices';
export const PUT = api(async (request, context, user) => updateInvoice(user, (await params(context)).id, await json(request)));
