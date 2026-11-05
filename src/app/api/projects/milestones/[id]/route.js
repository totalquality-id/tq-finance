import { api, json, params } from '@/lib/http';
import { deleteMilestone, updateMilestone } from '@/lib/services/projects';
export const PUT = api(async (request, context, user) => updateMilestone(user, (await params(context)).id, await json(request)));
export const DELETE = api(async (request, context, user) => deleteMilestone(user, (await params(context)).id));
