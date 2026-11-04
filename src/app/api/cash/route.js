import { api, json } from '@/lib/http';
import { listCash, saveCash } from '@/lib/services/cash';
export const GET = api(async (request) => listCash(Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => saveCash(user, null, await json(request)));
