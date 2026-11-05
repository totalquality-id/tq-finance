import { api, json, params } from '@/lib/http';
import { addFollowUp } from '@/lib/services/invoices';
export const POST = api(async (request, context, user) => addFollowUp(user, (await params(context)).id, await json(request)));
