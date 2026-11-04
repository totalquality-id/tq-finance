import { api, json } from '@/lib/http';
import { createJournal, listJournals } from '@/lib/services/journals';
export const GET = api(async (request) => listJournals(Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => createJournal(user, await json(request)));
