'use client';

import { useState } from 'react';
import Image from 'next/image';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { LogIn, ShieldAlert, Eye, EyeOff } from 'lucide-react';

export default function LoginClient() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn('credentials', { redirect: false, email: form.email, password: form.password });
    if (res?.error) {
      setError('Email atau kata sandi salah.');
      setLoading(false);
    } else {
      router.push('/dashboard');
      router.refresh();
    }
  };

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <Image src="/brand/tq-logo-full.png" alt="Total Quality" width={661} height={138} priority style={{ height: 52, width: 'auto' }} />
        </div>
        <h1 className="login-title" style={{ marginBottom: 24 }}>TQ Finance</h1>

        {error && (
          <div className="alert alert-danger" role="alert" style={{ marginBottom: 18, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: 2 }} /> <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label className="form-label required" htmlFor="login-email">Email</label>
            <input id="login-email" type="email" autoComplete="username" className="form-input" value={form.email} onChange={set('email')} required disabled={loading} />
          </div>
          <div className="form-group">
            <label className="form-label required" htmlFor="login-password">Kata sandi</label>
            <div style={{ position: 'relative' }}>
              <input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" className="form-input" style={{ paddingRight: 46 }} value={form.password} onChange={set('password')} required disabled={loading} />
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                style={{ position: 'absolute', right: 3, top: 3 }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? <><span className="spinner" aria-hidden /> Memeriksa…</> : <><LogIn aria-hidden /> Masuk</>}
          </button>
        </form>

      </div>
    </main>
  );
}
