import { api, json } from '@/lib/http';
import { createBill, listBills } from '@/lib/services/bills';
export const GET = api(async (request) => listBills(Object.fromEntries(new URL(request.url).searchParams)));
export const POST = api(async (request, context, user) => createBill(user, await json(request)));
