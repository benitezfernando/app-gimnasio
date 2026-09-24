import { apiFetch } from '../../../lib/api-client';
import { PageHeader } from '../../../components/ui/page-header';
import { LogoutButton } from '../../../components/logout-button';
import { CreateAdminForm } from './create-admin-form';
import { AdminsList } from './admins-list';

interface AdminRow {
  id: string;
  gymId: string | null;
  username: string;
  nombre: string;
  activo: boolean;
}

export default async function SuperAdminPage() {
  const admins = await apiFetch<AdminRow[]>('/super-admin/admins');
  const gymIdsExistentes = [
    ...new Set(admins.map((a) => a.gymId).filter((id): id is string => id !== null)),
  ];

  return (
    <main className="min-h-dvh bg-background px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-6 lg:pt-16">
      <div className="flex w-full flex-col gap-6 sm:mx-auto sm:max-w-3xl">
        <PageHeader title="Super Admin" right={<LogoutButton redirectTo="/super-admin/login" />} />
        <CreateAdminForm gymIdsExistentes={gymIdsExistentes} />
        <AdminsList admins={admins} />
      </div>
    </main>
  );
}
