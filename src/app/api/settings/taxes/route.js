import { api, json } from '@/lib/http';
import { listTaxes, saveTax } from '@/lib/services/settings-admin';
export const GET = api(async () => listTaxes());
export const POST = api(async (request, context, user) => saveTax(user, null, await json(request)));
