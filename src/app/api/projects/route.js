import { api, json } from '@/lib/http';
import { listProjects, saveProject } from '@/lib/services/projects';
export const GET = api(async (request) => listProjects(Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => saveProject(user, null, await json(request)));
