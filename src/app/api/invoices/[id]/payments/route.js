import { api, json, params } from '@/lib/http';
import { addPayment } from '@/lib/services/invoices';
export const POST = api(async (request, context, user) => addPayment(user, (await params(context)).id, await json(request)));
