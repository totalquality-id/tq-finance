import { api, params } from '@/lib/http';
import { deleteInvoicePayment } from '@/lib/services/invoices';
export const DELETE = api(async (request, context, user) => deleteInvoicePayment(user, (await params(context)).paymentId));
