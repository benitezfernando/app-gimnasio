import Link from 'next/link';
import { apiFetch } from '../../../../lib/api-client';
import { CreateTemplateForm } from './create-template-form';

interface TemplateSummary {
  id: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
}

export default async function PlantillasPage() {
  const plantillas = await apiFetch<TemplateSummary[]>('/routine-templates');

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold text-text">Mis plantillas</h1>

      <CreateTemplateForm />

      <ul className="flex flex-col gap-2">
        {plantillas.map((plantilla) => (
          <li key={plantilla.id}>
            <Link
              href={`/profesor/plantillas/${plantilla.id}`}
              className="flex min-h-11 items-center justify-between rounded-lg border border-border bg-surface px-4 py-2"
            >
              <div>
                <p className="text-sm font-medium text-text">{plantilla.nombre}</p>
                {plantilla.descripcion && (
                  <p className="text-xs text-text-muted">{plantilla.descripcion}</p>
                )}
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  plantilla.activa ? 'bg-success/15 text-success' : 'bg-surface-alt text-text-muted'
                }`}
              >
                {plantilla.activa ? 'Activa' : 'Inactiva'}
              </span>
            </Link>
          </li>
        ))}
        {plantillas.length === 0 && (
          <p className="text-sm text-text-muted">Todavía no armaste ninguna plantilla.</p>
        )}
      </ul>
    </main>
  );
}
