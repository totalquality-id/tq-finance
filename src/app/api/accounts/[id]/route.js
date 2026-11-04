import { api, json, params } from '@/lib/http';
import { deleteAccount, saveAccount } from '@/lib/services/accounts';
export const PUT = api(async (request, context, user) => saveAccount(user, (await params(context)).id, await json(request)));
export const DELETE = api(async (request, context, user) => deleteAccount(user, (await params(context)).id));
