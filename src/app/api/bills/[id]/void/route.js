import { api, json, params } from '@/lib/http';
import { voidBill } from '@/lib/services/bills';
export const POST = api(async (request, context, user) => voidBill(user, (await params(context)).id, await json(request)));
