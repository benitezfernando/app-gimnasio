import { Users } from 'lucide-react';
import { apiFetch } from '../../../lib/api-client';
import { PageHeader } from '../../../components/ui/page-header';
import { LogoutButton } from '../../../components/logout-button';
import { CreateAlumnoForm } from './create-alumno-form';
import { AlumnoRow } from './alumno-row';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';

interface AlumnoRowData {
  id: string;
  nombre: string;
  username: string;
  activo: boolean;
}

export default async function ProfesorDashboardPage() {
  const alumnos = await apiFetch<AlumnoRowData[]>('/users/me/alumnos');

  return (
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-16">
      <PageHeader title="Mi cartera" right={<LogoutButton />} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Nuevo alumno</h2>
        <CreateAlumnoForm />
      </section>

      <ul className="flex flex-col gap-2">
        {alumnos.map((alumno) => (
          <AlumnoRow key={alumno.id} alumno={alumno} />
        ))}
        {alumnos.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users />
              </EmptyMedia>
              <EmptyTitle>Todavía no tenés alumnos</EmptyTitle>
              <EmptyDescription>
                Creá uno arriba o pedile al Admin que te asigne alguno.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </ul>
    </main>
  );
}
