import { api, json } from '@/lib/http';
import { getAssets, saveAssets } from '@/lib/services/settings-admin';
export const GET = api(async () => getAssets());
export const PUT = api(async (request, context, user) => saveAssets(user, await json(request)));
