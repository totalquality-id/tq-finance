import { api, json } from '@/lib/http';
import { previewDepreciation, runDepreciation, undoDepreciation } from '@/lib/services/assets';
export const GET = api(async (request) => previewDepreciation(new URL(request.url).searchParams.get('period')));
export const POST = api(async (request, context, user) => runDepreciation(user, await json(request)));
export const DELETE = api(async (request, context, user) => undoDepreciation(user, await json(request)));
