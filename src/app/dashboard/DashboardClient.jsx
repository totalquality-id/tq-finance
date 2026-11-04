'use client';

import Link from 'next/link';
import { Landmark, FileText, ReceiptText, TrendingUp, Briefcase, Wallet } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, Line, ComposedChart } from 'recharts';
import { Badge, Card, DataTable, Kpi } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { idr } from '@/lib/labels';

// Warna dari logo TQ: biru korporat untuk pendapatan, abu-biru untuk beban, kuning untuk laba.
const C = { brand: '#173e76', soft: '#a2b2c8', gold: '#d4ab00', red: '#c2453d' };
const short = (v) => {
  const n = Math.abs(v);
  if (n >= 1e9) return (v / 1e9).toFixed(1).replace('.', ',') + ' M';
  if (n >= 1e6) return (v / 1e6).toFixed(0) + ' jt';
  if (n >= 1e3) return (v / 1e3).toFixed(0) + ' rb';
  return String(v);
};

export default function DashboardClient({ data }) {
  const dueCols = (base) => [
    { key: 'number', label: 'Nomor', render: (r) => <Link href={`/${base}?q=${r.number}`}><strong>{r.number}</strong></Link> },
    { key: 'party', label: base === 'invoices' ? 'Klien' : 'Vendor' },
    { key: 'due', label: 'Jatuh tempo', render: (r) => <span className={r.overdue ? 'text-red' : ''}>{formatDate(r.dueDate)}</span> },
    { key: 'out', label: 'Sisa', num: true, render: (r) => idr(r.outstanding) },
    { key: 'st', label: '', render: (r) => (r.overdue ? <Badge value="OVERDUE" /> : null) },
  ];
  return (
    <div className="stack">
      <div className="kpi-grid">
        <Kpi label="Saldo kas & bank" value={idr(data.cash.total)} icon={Landmark} tone="navy" href="/cash" hint={`${data.cash.accounts.length} rekening`} />
        <Kpi label="Piutang usaha" value={idr(data.ar.total)} icon={FileText} tone={data.ar.overdue ? 'red' : 'blue'} href="/invoices?status=OPEN" hint={data.ar.overdue ? `${idr(data.ar.overdue)} lewat jatuh tempo` : `${data.ar.count} invoice terbuka`} />
        <Kpi label="Hutang usaha" value={idr(data.ap.total)} icon={ReceiptText} tone={data.ap.overdue ? 'red' : 'orange'} href="/bills?status=OPEN" hint={data.ap.overdue ? `${idr(data.ap.overdue)} lewat jatuh tempo` : `${data.ap.count} tagihan terbuka`} />
        <Kpi label="Proyek aktif" value={data.projects.active} icon={Briefcase} tone="green" href="/projects?status=AKTIF" hint={`Nilai kontrak ${idr(data.projects.contractValue)}`} />
      </div>
      <div className="kpi-grid">
        <Kpi label="Pendapatan bulan ini" value={idr(data.mtd.revenue)} icon={TrendingUp} tone="navy" href="/reports?tab=pl" />
        <Kpi label="Laba bersih bulan ini" value={idr(data.mtd.net)} icon={Wallet} tone={data.mtd.net < 0 ? 'red' : 'green'} href="/reports?tab=pl" />
        <Kpi label="Pendapatan tahun berjalan" value={idr(data.ytd.revenue)} icon={TrendingUp} tone="blue" href="/reports?tab=pl" hint={`Margin kotor ${data.ytd.grossMargin}%`} />
        <Kpi label="Laba bersih tahun berjalan" value={idr(data.ytd.net)} icon={Wallet} tone={data.ytd.net < 0 ? 'red' : 'green'} href="/reports?tab=pl" />
      </div>

      <Card title="Pendapatan vs beban — 12 bulan terakhir">
        <div style={{ width: '100%', height: 290 }}>
          <ResponsiveContainer>
            <ComposedChart data={data.months}>
              <CartesianGrid stroke="#e3e6eb" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={short} />
              <Tooltip formatter={(v) => idr(v)} />
              <Legend />
              <Bar dataKey="Pendapatan" fill={C.brand} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Beban" fill={C.soft} radius={[4, 4, 0, 0]} />
              <Line dataKey="Laba" stroke={C.gold} strokeWidth={2.5} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Umur piutang" actions={<Link href="/reports?tab=ar" className="btn btn-ghost btn-sm">Detail</Link>}>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={data.ar.buckets} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid stroke="#e3e6eb" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={short} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} width={110} />
                <Tooltip formatter={(v) => idr(v)} />
                <Bar dataKey="value" name="Piutang" fill={C.brand} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Klien terbesar tahun ini (nilai invoice)" padding={0}>
          <DataTable rows={data.topClients} rowKey={(r) => r.name} empty="Belum ada invoice tahun ini." columns={[
            { key: 'name', label: 'Klien' },
            { key: 'value', label: 'Nilai (sebelum pajak)', num: true, render: (r) => idr(r.value) },
          ]} />
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Invoice jatuh tempo ≤ 14 hari" actions={<Link href="/invoices?status=OVERDUE" className="btn btn-ghost btn-sm">Lewat tempo</Link>} padding={0}>
          <DataTable rows={data.dueInvoices} empty="Tidak ada invoice yang segera jatuh tempo." columns={dueCols('invoices')} />
        </Card>
        <Card title="Tagihan vendor jatuh tempo ≤ 14 hari" actions={<Link href="/bills?status=OVERDUE" className="btn btn-ghost btn-sm">Lewat tempo</Link>} padding={0}>
          <DataTable rows={data.dueBills} empty="Tidak ada tagihan yang segera jatuh tempo." columns={dueCols('bills')} />
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Saldo per rekening" padding={0}>
          <DataTable rows={data.cash.accounts} columns={[
            { key: 'name', label: 'Rekening', render: (a) => <Link href={`/reports?tab=gl&accountId=${a.id}`}>{a.code} · {a.name}</Link> },
            { key: 'balance', label: 'Saldo', num: true, render: (a) => <span className={a.balance < 0 ? 'text-red' : ''}>{idr(a.balance)}</span> },
          ]} />
        </Card>
        <Card title="Jurnal terbaru" actions={<Link href="/journals" className="btn btn-ghost btn-sm">Semua</Link>} padding={0}>
          <DataTable rows={data.recent} empty="Belum ada jurnal." columns={[
            { key: 'number', label: 'No.', render: (j) => (<div><strong>{j.number}</strong><div className="muted">{formatDate(j.date)}</div></div>) },
            { key: 'description', label: 'Keterangan' },
            { key: 'src', label: 'Sumber', render: (j) => <Badge value={j.source} /> },
            { key: 'total', label: 'Total', num: true, render: (j) => idr(j.totalDebit) },
          ]} />
        </Card>
      </div>
    </div>
  );
}
