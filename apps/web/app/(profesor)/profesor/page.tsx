import Link from 'next/link';
import { apiFetch } from '../../../lib/api-client';
import { PageHeader } from '../../../components/ui/page-header';
import { LogoutButton } from '../../../components/logout-button';

interface AlumnoRow {
  id: string;
  nombre: string;
  username: string;
  activo: boolean;
}

export default async function ProfesorDashboardPage() {
  const alumnos = await apiFetch<AlumnoRow[]>('/users/me/alumnos');

  return (
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-16">
      <PageHeader title="Mi cartera" right={<LogoutButton />} />

      <ul className="flex flex-col gap-2">
        {alumnos.map((alumno) => (
          <li key={alumno.id}>
            <Link
              href={`/profesor/alumnos/${alumno.id}`}
              className="flex min-h-11 items-center justify-between rounded-lg border border-border bg-surface px-4 py-2"
            >
              <div>
                <p className="text-sm font-medium text-text">{alumno.nombre}</p>
                <p className="text-xs text-text-muted">@{alumno.username}</p>
              </div>
              {!alumno.activo && (
                <span className="rounded-full bg-surface-alt px-2.5 py-1 text-xs font-medium text-text-muted">
                  Inactivo
                </span>
              )}
            </Link>
          </li>
        ))}
        {alumnos.length === 0 && (
          <p className="text-sm text-text-muted">
            Todavía no tenés alumnos asignados — pedile al Admin que te asigne alguno.
          </p>
        )}
      </ul>
    </main>
  );
}
