import { api, json, params } from '@/lib/http';
import { voidInvoice } from '@/lib/services/invoices';
export const POST = api(async (request, context, user) => voidInvoice(user, (await params(context)).id, await json(request)));
