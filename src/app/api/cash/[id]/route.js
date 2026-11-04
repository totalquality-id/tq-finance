import { api, json, params } from '@/lib/http';
import { deleteCash, saveCash } from '@/lib/services/cash';
export const PUT = api(async (request, context, user) => saveCash(user, (await params(context)).id, await json(request)));
export const DELETE = api(async (request, context, user) => deleteCash(user, (await params(context)).id));
