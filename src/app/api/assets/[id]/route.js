import { api, json, params } from '@/lib/http';
import { saveAsset } from '@/lib/services/assets';
export const PUT = api(async (request, context, user) => saveAsset(user, (await params(context)).id, await json(request)));
