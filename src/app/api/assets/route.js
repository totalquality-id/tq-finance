import { api, json } from '@/lib/http';
import { listAssets, saveAsset } from '@/lib/services/assets';
export const GET = api(async (request) => listAssets(Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => saveAsset(user, null, await json(request)));
