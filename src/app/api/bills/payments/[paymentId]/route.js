import { api, params } from '@/lib/http';
import { deleteBillPayment } from '@/lib/services/bills';
export const DELETE = api(async (request, context, user) => deleteBillPayment(user, (await params(context)).paymentId));
