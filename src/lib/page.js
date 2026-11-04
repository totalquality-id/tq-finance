import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { canAccess } from '@/lib/access';

// Guard halaman server: login + izin modul. Mengembalikan user sesi.
export async function requirePage(path) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!canAccess(session.user.role, path)) redirect('/dashboard');
  return session.user;
}

export async function query(searchParams) {
  const q = (await searchParams) ?? {};
  const page = Math.max(1, Math.min(100000, parseInt(q.page ?? '1', 10) || 1));
  return { ...q, page, skip: (page - 1) * 50, take: 50 };
}
