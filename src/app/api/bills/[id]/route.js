import { api, json, params } from '@/lib/http';
import { updateBill } from '@/lib/services/bills';
export const PUT = api(async (request, context, user) => updateBill(user, (await params(context)).id, await json(request)));
