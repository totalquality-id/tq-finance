'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '@/lib/client-api';
import { normalizePresenter } from '@/lib/domain/billing';

/**
 * Isian presenter jamak. Ketik kode lalu Enter / koma: kode langsung disimpan ke
 * master presenter (tersedia untuk kontrak lain) dan ditambahkan ke kontrak ini.
 */
export default function PresenterInput({ value, onChange, options, onOptionsChange, id = 'presenters' }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const add = async (raw) => {
    const code = normalizePresenter(raw);
    setText('');
    if (!code) return raw.trim() && setError('Kode 2–12 huruf/angka, mis. YSF.');
    setError(null);
    if (!value.includes(code)) onChange([...value, code]);
    if (!options.includes(code)) {
      try {
        await apiFetch('/api/presenters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
        onOptionsChange?.([...options, code].sort());
      } catch (e) { setError(e.message); }
    }
  };
  return (
    <div>
      <div className="tag-input" onClick={() => document.getElementById(id)?.focus()}>
        {value.map((c) => (
          <span key={c} className="tag">{c}<button type="button" aria-label={`Hapus ${c}`} onClick={() => onChange(value.filter((x) => x !== c))}><X size={12} /></button></span>
        ))}
        <input id={id} list={id + '-list'} value={text} placeholder={value.length ? '' : 'Ketik kode, Enter'}
          onChange={(e) => (/[,|]$/.test(e.target.value) ? add(e.target.value.slice(0, -1)) : setText(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(text); }
            if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => text && add(text)} />
        <datalist id={id + '-list'}>{options.filter((o) => !value.includes(o)).map((o) => <option key={o} value={o} />)}</datalist>
      </div>
      {error && <div className="form-hint text-red">{error}</div>}
    </div>
  );
}
