import { api } from '@/lib/http';
import { currentTab } from '@/lib/module-tabs';
import { todayIso } from '@/lib/dates';
import { exportReport, xlsxResponse } from '@/lib/services/reports';

export const GET = api(async (request, context, user) => {
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const tab = sp.tab === 'billing' ? 'billing' : currentTab('/reports', sp.tab);
  return xlsxResponse(await exportReport(user, tab, sp), 'TQ-Finance-' + tab + '-' + todayIso() + '.xlsx');
});
