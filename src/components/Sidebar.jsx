'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useLayoutEffect, useRef } from 'react';
import { signOut } from 'next-auth/react';
import { LayoutDashboard, Bell, FileText, CalendarRange, Briefcase, Users, ChartColumn, UserCog, SlidersHorizontal, History, LogOut, X } from 'lucide-react';
import { useDialog } from './DialogProvider';
import { canAccess, ROLE_LABELS } from '@/lib/access';

const NAV_ITEMS = [
  {
    section: 'Utama',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/notifications', label: 'Notifikasi', icon: Bell },
    ],
  },
  {
    section: 'Penagihan',
    items: [
      { href: '/invoices', label: 'Invoice', icon: FileText },
      { href: '/billing', label: 'Monitoring Penagihan', icon: CalendarRange },
      { href: '/projects', label: 'Kontrak & Termin', icon: Briefcase },
      { href: '/contacts', label: 'Copart', icon: Users },
    ],
  },
  {
    section: 'Laporan',
    items: [{ href: '/reports', label: 'Laporan Penagihan', icon: ChartColumn }],
  },
  {
    section: 'Sistem',
    items: [
      { href: '/users', label: 'Pengguna', icon: UserCog },
      { href: '/settings', label: 'Pengaturan', icon: SlidersHorizontal },
      { href: '/audit-log', label: 'Audit Log', icon: History },
    ],
  },
];

const initials = (name) => (name || 'U').trim().split(/\s+/).map((n) => n[0]).slice(0, 2).join('').toUpperCase();
const isActiveHref = (pathname, href) => pathname === href || pathname.startsWith(href + '/');

// Setiap halaman merender AppLayout-nya sendiri sehingga Sidebar dipasang ulang
// saat pindah halaman; posisi gulir disimpan agar tidak kembali ke atas.
const navMemory = { scrollTop: 0 };

export default function Sidebar({ user, isOpen, setIsOpen }) {
  const pathname = usePathname();
  const { showConfirm } = useDialog();
  const navRef = useRef(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    nav.scrollTop = navMemory.scrollTop;
    // Pastikan menu aktif terlihat, mis. saat halaman dibuka dari luar sidebar.
    const current = nav.querySelector('[aria-current="page"]');
    if (current) {
      const box = nav.getBoundingClientRect();
      const item = current.getBoundingClientRect();
      if (item.top < box.top) nav.scrollTop -= box.top - item.top + 8;
      else if (item.bottom > box.bottom) nav.scrollTop += item.bottom - box.bottom + 8;
    }
    return () => { navMemory.scrollTop = nav.scrollTop; };
  }, [pathname]);

  if (!user) return null;
  const role = user.role;

  const handleLogout = async () => {
    if (await showConfirm('Apakah Anda yakin ingin keluar dari aplikasi?', 'Keluar')) signOut({ callbackUrl: '/login' });
  };

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`} aria-label="Navigasi utama">
      <div className="sidebar-logo">
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, color: 'inherit' }}>
          <Image src="/brand/tq-logo.png" alt="Logo Total Quality" width={61} height={36} priority />
          <span className="sidebar-logo-text">
            <span className="sidebar-logo-name" style={{ display: 'block' }}>TQ Finance</span>
          </span>
        </Link>
        <button type="button" className="sidebar-close" onClick={() => setIsOpen?.(false)} aria-label="Tutup navigasi">
          <X size={20} />
        </button>
      </div>

      <nav ref={navRef} className="sidebar-nav" onScroll={(e) => { navMemory.scrollTop = e.currentTarget.scrollTop; }}>
        {NAV_ITEMS.map((section) => {
          const visible = section.items.filter((item) => canAccess(role, item.href));
          if (!visible.length) return null;
          return (
            <div key={section.section} className="nav-section">
              <div className="nav-section-label">{section.section}</div>
              {visible.map((item) => {
                const active = isActiveHref(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-item ${active ? 'active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setIsOpen?.(false)}
                  >
                    <Icon className="nav-icon" aria-hidden />
                    <span className="nav-label">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <Link href="/account" className="sidebar-user-link" title="Akun & kata sandi">
            <div className="user-avatar" aria-hidden>{initials(user.name)}</div>
            <div className="user-info">
              <div className="user-name">{user.name}</div>
              <div className="user-role">{ROLE_LABELS[role] || role}</div>
            </div>
          </Link>
          <button type="button" onClick={handleLogout} className="icon-btn danger" title="Keluar" aria-label="Keluar">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
}
