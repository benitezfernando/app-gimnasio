import { apiFetch, ApiError } from '../../../../../lib/api-client';
import { InstanceEditor } from './instance-editor';
import { NewRoutineForm } from './new-routine-form';
import { LogoutButton } from '../../../../../components/logout-button';
import { HomeLink } from '../../../../../components/ui/home-link';
import { DiaRutinaApi, diasDeRutinaAEdicion } from '../../../../../lib/routine-days';

interface TemplateOption {
  id: string;
  nombre: string;
  activa: boolean;
}

interface RutinaVigenteResponse {
  id: string;
  nombre: string;
  dias: DiaRutinaApi[];
}

export default async function AlumnoDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const plantillas = (await apiFetch<TemplateOption[]>('/routine-templates'))
    .filter((p) => p.activa)
    .map(({ id, nombre }) => ({ id, nombre }));

  let rutinaVigente: RutinaVigenteResponse | null = null;
  try {
    rutinaVigente = await apiFetch<RutinaVigenteResponse>(`/users/${params.id}/rutina-vigente`);
  } catch (error) {
    // 200 con body vacío si no hay vigente; este catch es para un 403/404 real.
    if (!(error instanceof ApiError)) throw error;
    rutinaVigente = null;
  }

  return (
    <main className="flex w-full flex-col gap-6 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-16">
      <div className="flex items-center justify-between">
        <HomeLink href="/profesor" />
        <LogoutButton />
      </div>

      <h1 className="text-xl font-semibold text-foreground">
        {rutinaVigente ? `Rutina de ${rutinaVigente.nombre}` : 'Sin rutina asignada'}
      </h1>

      {rutinaVigente && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Ajustar rutina</h2>
          <InstanceEditor
            instancia={{ id: rutinaVigente.id, dias: diasDeRutinaAEdicion(rutinaVigente.dias) }}
            plantillas={plantillas}
          />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {rutinaVigente ? 'Reemplazar por una rutina nueva' : 'Armar rutina'}
        </h2>
        {plantillas.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No tenés plantillas activas — podés armar la rutina desde cero o crear una en{' '}
            <a href="/profesor/plantillas" className="text-primary-soft underline">
              Mis plantillas
            </a>
            .
          </p>
        )}
        <NewRoutineForm
          alumnoId={params.id}
          plantillas={plantillas}
          reemplazaRutinaVigente={Boolean(rutinaVigente)}
        />
      </section>
    </main>
  );
}
