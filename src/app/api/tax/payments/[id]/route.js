import { api, params } from '@/lib/http';
import { deleteTaxPayment } from '@/lib/services/tax';
export const DELETE = api(async (request, context, user) => deleteTaxPayment(user, (await params(context)).id));
