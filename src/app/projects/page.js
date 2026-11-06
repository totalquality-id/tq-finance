import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { query, requirePage } from '@/lib/page';
import { contactOptions } from '@/lib/services/contacts';
import { prisma } from '@/lib/prisma';
import { listPresenters, listProjects } from '@/lib/services/projects';
import ProjectsClient from './ProjectsClient';

export const metadata = { title: 'Kontrak & Termin' };

export default async function ProjectsPage({ searchParams }) {
  const user = await requirePage('/projects');
  const q = await query(searchParams);
  const [data, clients, presenters, programs] = await Promise.all([
    listProjects(q, q), contactOptions(), listPresenters(),
    prisma.project.findMany({ where: { standard: { not: null } }, distinct: ['standard'], select: { standard: true } }).then((r) => r.map((x) => x.standard)),
  ]);
  return (
    <AppLayout title="Kontrak & Termin" user={user}>
      <ProjectsClient data={data} clients={clients} presenters={presenters} programs={programs} page={q.page} canEdit={canWrite(user.role, 'projects')} />
    </AppLayout>
  );
}
