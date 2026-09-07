import Link from 'next/link';
import { apiFetch } from '../../../lib/api-client';

interface AlumnoRow {
  id: string;
  nombre: string;
  username: string;
  activo: boolean;
}

export default async function ProfesorDashboardPage() {
  const alumnos = await apiFetch<AlumnoRow[]>('/users/me/alumnos');

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Mi cartera</h1>
        <Link href="/profesor/plantillas" className="text-sm font-medium text-accent">
          Ver plantillas
        </Link>
      </div>

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
