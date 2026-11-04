import { api, json, params } from '@/lib/http';
import { deleteJournal, updateJournal } from '@/lib/services/journals';
export const PUT = api(async (request, context, user) => updateJournal(user, (await params(context)).id, await json(request)));
export const DELETE = api(async (request, context, user) => deleteJournal(user, (await params(context)).id));
