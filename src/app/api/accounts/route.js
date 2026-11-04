import { api, json } from '@/lib/http';
import { listAccounts, saveAccount } from '@/lib/services/accounts';
export const GET = api(async () => listAccounts());
export const POST = api(async (request, context, user) => saveAccount(user, null, await json(request)));
