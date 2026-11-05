'use client';

import { Printer, X } from 'lucide-react';

export default function PrintToolbar({ number, voided }) {
  return (
    <div className="print-toolbar no-print">
      <strong>{number}</strong>
      {voided && <span className="badge badge-gray">Dibatalkan</span>}
      <span className="spacer" />
      <button type="button" className="btn btn-outline btn-sm" onClick={() => window.close()}><X size={15} /> Tutup</button>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}><Printer size={15} /> Cetak / simpan PDF</button>
    </div>
  );
}
