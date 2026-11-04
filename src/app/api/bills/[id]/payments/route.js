import { api, json, params } from '@/lib/http';
import { addBillPayment } from '@/lib/services/bills';
export const POST = api(async (request, context, user) => addBillPayment(user, (await params(context)).id, await json(request)));
