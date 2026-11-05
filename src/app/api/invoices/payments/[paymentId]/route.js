import { api, params } from '@/lib/http';
import { deletePayment } from '@/lib/services/invoices';
export const DELETE = api(async (request, context, user) => deletePayment(user, (await params(context)).paymentId));
