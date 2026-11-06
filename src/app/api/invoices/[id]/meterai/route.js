import { api, json, params } from '@/lib/http';
import { setMeterai } from '@/lib/services/invoices';
export const PUT = api(async (request, context, user) => setMeterai(user, (await params(context)).id, await json(request)));
