import { api, json, params } from '@/lib/http';
import { markSent } from '@/lib/services/invoices';
export const POST = api(async (request, context, user) => markSent(user, (await params(context)).id, await json(request)));
