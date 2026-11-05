'use client';

import { useState } from 'react';
import { DataTable, FilterBar, Modal, Pager } from '@/components/ui';

const MODULES = ['invoices', 'projects', 'contacts', 'reports', 'settings', 'users', 'account'];
const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'VOID', 'SEND', 'FOLLOW_UP', 'PAYMENT', 'EXPORT'];

export default function AuditClient({ data, page }) {
  const [detail, setDetail] = useState(null);
  return (
    <div className="stack">
      <FilterBar filters={[
        { type: 'search', label: 'Cari', placeholder: 'Pelaku / catatan' },
        { name: 'module', label: 'Modul', type: 'select', options: MODULES.map((m) => [m, m]) },
        { name: 'action', label: 'Aksi', type: 'select', options: ACTIONS.map((a) => [a, a]) },
        { name: 'from', label: 'Dari', type: 'date' },
        { name: 'to', label: 'Sampai', type: 'date' },
      ]} />
      <div className="card">
        <DataTable rows={data.rows} onRowClick={setDetail} empty="Belum ada log."
          columns={[
            { key: 'at', label: 'Waktu', render: (r) => new Date(r.createdAt).toLocaleString('id-ID') },
            { key: 'actorName', label: 'Pelaku' },
            { key: 'action', label: 'Aksi', render: (r) => <span className={`badge ${r.action === 'VOID' || r.action === 'CLOSE' ? 'badge-warning' : r.action === 'DELETE' ? 'badge-danger' : 'badge-gray'}`}>{r.action}</span> },
            { key: 'module', label: 'Modul' },
            { key: 'note', label: 'Keterangan', render: (r) => <span className="muted">{r.note ?? (r.after ? Object.keys(r.after).slice(0, 4).join(', ') : '-')}</span> },
          ]} />
      </div>
      <Pager page={page} total={data.total} />
      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `${detail.action} · ${detail.module}` : ''} size="modal-lg">
        {detail && (
          <div className="stack">
            <dl className="detail-grid">
              <div><dt>Pelaku</dt><dd>{detail.actorName}</dd></div>
              <div><dt>Waktu</dt><dd>{new Date(detail.createdAt).toLocaleString('id-ID')}</dd></div>
              <div><dt>Record</dt><dd><code>{detail.recordId ?? '-'}</code></dd></div>
              <div><dt>Catatan</dt><dd>{detail.note ?? '-'}</dd></div>
            </dl>
            <div className="grid-2">
              <div><div className="section-title">Sebelum</div><pre style={{ background: 'var(--gray-50)', padding: 12, borderRadius: 10, fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(detail.before, null, 2) ?? '-'}</pre></div>
              <div><div className="section-title">Sesudah</div><pre style={{ background: 'var(--gray-50)', padding: 12, borderRadius: 10, fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(detail.after, null, 2) ?? '-'}</pre></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
