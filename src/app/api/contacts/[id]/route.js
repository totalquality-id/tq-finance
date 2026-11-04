import { api, json, params } from '@/lib/http';
import { deleteContact, saveContact } from '@/lib/services/contacts';
export const PUT = api(async (request, context, user) => saveContact(user, (await params(context)).id, await json(request)));
export const DELETE = api(async (request, context, user) => deleteContact(user, (await params(context)).id));
