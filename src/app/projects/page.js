import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { query, requirePage } from '@/lib/page';
import { contactOptions } from '@/lib/services/contacts';
import { listProjects } from '@/lib/services/projects';
import ProjectsClient from './ProjectsClient';

export const metadata = { title: 'Proyek & Kontrak' };

export default async function ProjectsPage({ searchParams }) {
  const user = await requirePage('/projects');
  const q = await query(searchParams);
  const [data, clients] = await Promise.all([listProjects(q, q), contactOptions(['CLIENT'])]);
  return (
    <AppLayout title="Proyek & Kontrak" user={user}>
      <ProjectsClient data={data} clients={clients} page={q.page} canEdit={canWrite(user.role, 'projects')} />
    </AppLayout>
  );
}
