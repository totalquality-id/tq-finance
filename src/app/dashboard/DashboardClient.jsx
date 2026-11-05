'use client';

import Link from 'next/link';
import { FileText, Briefcase, TrendingUp, CalendarRange } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Card, DataTable, Kpi } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { idr } from '@/lib/labels';

const short = (v) => {
  const n = Math.abs(v);
  if (n >= 1e9) return (v / 1e9).toFixed(1).replace('.', ',') + ' M';
  if (n >= 1e6) return (v / 1e6).toFixed(0) + ' jt';
  if (n >= 1e3) return (v / 1e3).toFixed(0) + ' rb';
  return String(v);
};

export default function DashboardClient({ data }) {
  return (
    <div className="stack">
      <div className="kpi-grid">
        <Kpi label="Piutang belum lunas" value={idr(data.ar.total)} icon={FileText} tone={data.ar.overdue ? 'red' : 'navy'} href="/invoices?status=OPEN" hint={data.ar.overdue ? `${idr(data.ar.overdue)} lewat jatuh tempo` : `${data.ar.count} invoice terbuka`} />
        <Kpi label="Kontrak berjalan" value={data.projects.active} icon={Briefcase} href="/projects?status=AKTIF" hint={`Nilai kontrak ${idr(data.projects.contractValue)}`} />
        <Kpi label="Pendapatan bulan ini" value={idr(data.month.revenue)} icon={CalendarRange} href="/reports?tab=invoices" hint={`Diterima ${idr(data.month.received)}`} />
        <Kpi label="Omset tahun berjalan" value={idr(data.ytd.revenue)} icon={TrendingUp} href="/reports?tab=invoices" hint={`${data.ytd.count} invoice`} />
      </div>

      <div className="grid-2">
        <Card title="Umur piutang" actions={<Link href="/reports?tab=aging" className="btn btn-ghost btn-sm">Detail</Link>}>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={data.ar.buckets} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid stroke="#e3e6eb" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={short} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} width={110} />
                <Tooltip formatter={(v) => idr(v)} />
                <Bar dataKey="value" name="Piutang" fill="#173e76" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Copart terbesar tahun ini" padding={0}>
          <DataTable rows={data.topClients} rowKey={(r) => r.name} empty="Belum ada invoice tahun ini." columns={[
            { key: 'name', label: 'Copart' },
            { key: 'value', label: 'Omset', num: true, render: (r) => idr(r.value) },
          ]} />
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Invoice jatuh tempo ≤ 14 hari" actions={<Link href="/invoices?status=OVERDUE" className="btn btn-ghost btn-sm">Lewat tempo</Link>} padding={0}>
          <DataTable rows={data.dueInvoices} empty="Tidak ada invoice yang segera jatuh tempo." columns={[
            { key: 'number', label: 'Nomor', render: (r) => <Link href={`/invoices?q=${encodeURIComponent(r.number)}`}><strong>{r.number}</strong></Link> },
            { key: 'party', label: 'Copart' },
            { key: 'due', label: 'Jatuh tempo', render: (r) => <span className={r.overdue ? 'text-red' : ''}>{formatDate(r.dueDate)}</span> },
            { key: 'out', label: 'Sisa', num: true, render: (r) => idr(r.outstanding) },
          ]} />
        </Card>
        <Card title="Perlu follow up" actions={<Link href="/invoices?status=FOLLOW_UP" className="btn btn-ghost btn-sm">Semua</Link>} padding={0}>
          <DataTable rows={data.followUps} empty="Tidak ada invoice yang perlu di-follow up." columns={[
            { key: 'number', label: 'Nomor', render: (r) => <Link href={`/invoices?q=${encodeURIComponent(r.number)}`}><strong>{r.number}</strong></Link> },
            { key: 'party', label: 'Copart' },
            { key: 'next', label: 'Jadwal', render: (r) => formatDate(r.nextFollowUpAt) },
            { key: 'out', label: 'Sisa', num: true, render: (r) => idr(r.outstanding) },
          ]} />
          {data.notSent > 0 && <div style={{ padding: '10px 16px' }}><Link href="/invoices?status=NOT_SENT">{data.notSent} invoice belum dikirim</Link></div>}
        </Card>
      </div>

      <Card title="Termin siap ditagih" actions={<Link href="/billing" className="btn btn-ghost btn-sm">Monitoring</Link>} padding={0}>
        <DataTable rows={data.termins} empty="Tidak ada termin yang menunggu ditagih bulan ini." columns={[
          { key: 'party', label: 'Copart', render: (r) => (<div><strong>{r.party}</strong><div className="muted">{r.project}</div></div>) },
          { key: 'name', label: 'Termin' },
          { key: 'due', label: 'Rencana tagih', render: (r) => <span className={r.late ? 'text-red' : ''}>{formatDate(r.dueDate)}</span> },
          { key: 'amount', label: 'Nominal', num: true, render: (r) => idr(r.amount) },
          { key: 'a', label: '', render: (r) => <Link className="btn btn-outline btn-sm" href={`/invoices?new=1&projectId=${r.projectId}&milestoneId=${r.id}`}>Buat invoice</Link> },
        ]} />
      </Card>
    </div>
  );
}
