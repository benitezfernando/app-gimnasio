import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { apiFetch } from '../../../../lib/api-client';
import { PageHeader } from '../../../../components/ui/page-header';
import { LogoutButton } from '../../../../components/logout-button';
import { HomeLink } from '../../../../components/ui/home-link';
import { CreateTemplateForm } from './create-template-form';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';

interface TemplateSummary {
  id: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
}

export default async function PlantillasPage() {
  const plantillas = await apiFetch<TemplateSummary[]>('/routine-templates');

  return (
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-16">
      <PageHeader
        title="Mis plantillas"
        left={<HomeLink href="/profesor" />}
        right={<LogoutButton />}
      />

      <CreateTemplateForm />

      <ul className="flex flex-col gap-2">
        {plantillas.map((plantilla) => (
          <li key={plantilla.id}>
            <Link
              href={`/profesor/plantillas/${plantilla.id}`}
              className="flex min-h-11 items-center justify-between rounded-lg border border-border bg-background px-4 py-2"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{plantilla.nombre}</p>
                {plantilla.descripcion && (
                  <p className="text-xs text-muted-foreground">{plantilla.descripcion}</p>
                )}
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  plantilla.activa ? 'bg-success/15 text-success' : 'bg-card text-muted-foreground'
                }`}
              >
                {plantilla.activa ? 'Activa' : 'Inactiva'}
              </span>
            </Link>
          </li>
        ))}
        {plantillas.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ClipboardList />
              </EmptyMedia>
              <EmptyTitle>Todavía no armaste ninguna plantilla</EmptyTitle>
              <EmptyDescription>Creá la primera con el formulario de arriba.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </ul>
    </main>
  );
}
