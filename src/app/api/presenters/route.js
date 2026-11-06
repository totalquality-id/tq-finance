import { api, json } from '@/lib/http';
import { createPresenter, listPresenters } from '@/lib/services/projects';
export const GET = api(async () => listPresenters());
export const POST = api(async (request, context, user) => createPresenter(user, await json(request)));
