import { api, json } from '@/lib/http';
import { setLockDate } from '@/lib/services/settings-admin';
export const PUT = api(async (request, context, user) => setLockDate(user, await json(request)));
