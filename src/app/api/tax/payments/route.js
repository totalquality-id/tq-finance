import { api, json } from '@/lib/http';
import { createTaxPayment, listTaxPayments } from '@/lib/services/tax';
export const GET = api(async (request) => listTaxPayments(Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => createTaxPayment(user, await json(request)));
