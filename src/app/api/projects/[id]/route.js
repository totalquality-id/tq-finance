import { api, json, params } from '@/lib/http';
import { saveProject } from '@/lib/services/projects';
export const PUT = api(async (request, context, user) => saveProject(user, (await params(context)).id, await json(request)));
