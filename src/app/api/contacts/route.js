import { api, json } from '@/lib/http';
import { listContacts, saveContact } from '@/lib/services/contacts';
export const GET = api(async (request) => listContacts(Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => saveContact(user, null, await json(request)));
