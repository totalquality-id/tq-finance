import { api, json, params } from '@/lib/http';
import { saveTax } from '@/lib/services/settings-admin';
export const PUT = api(async (request, context, user) => saveTax(user, (await params(context)).id, await json(request)));
