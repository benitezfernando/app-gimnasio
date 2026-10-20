import { apiFetch, ApiError } from '../../../../../lib/api-client';
import { InstanceEditor } from './instance-editor';
import { ReemplazarRutinaSection } from './reemplazar-rutina-section';
import { LogoutButton } from '../../../../../components/logout-button';
import { HomeLink } from '../../../../../components/ui/home-link';
import {
  DiaRutinaApi,
  diasDeRutinaAEdicion,
  esRutinaPersonalizada,
} from '../../../../../lib/routine-days';
import { Badge } from '@/components/ui/badge';
import { getCurrentUser } from '../../../../../lib/get-current-user';
import { GuiaDePantalla } from '../../../../../components/guia-de-pantalla';
import { GUIA_EDITOR_RUTINA, GUIA_PROFESOR_ALUMNO } from '../../../../../lib/guias-contenido';

interface TemplateOption {
  id: string;
  nombre: string;
  activa: boolean;
}

interface RutinaVigenteResponse {
  id: string;
  nombre: string;
  /** Ausente si el API es anterior a este campo: se asume dueño. */
  esDueno?: boolean;
  dias: DiaRutinaApi[];
}

export default async function AlumnoDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const usuario = await getCurrentUser();
  // Independientes entre sí: en paralelo, no una después de la otra.
  const [todasLasPlantillas, rutinaVigente] = await Promise.all([
    apiFetch<TemplateOption[]>('/routine-templates'),
    apiFetch<RutinaVigenteResponse>(`/users/${params.id}/rutina-vigente`).catch(
      (error: unknown) => {
        // 200 con body vacío si no hay vigente; este catch es para un 403/404 real.
        if (!(error instanceof ApiError)) throw error;
        return null;
      },
    ),
  ]);
  const plantillas = todasLasPlantillas
    .filter((p) => p.activa)
    .map(({ id, nombre }) => ({ id, nombre }));

  return (
    <main className="flex w-full flex-col gap-6 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-6">
      <GuiaDePantalla userId={usuario.id} guias={[GUIA_EDITOR_RUTINA, GUIA_PROFESOR_ALUMNO]} />
      <div className="flex items-center justify-between">
        <HomeLink href="/profesor" />
        <LogoutButton />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-foreground">
          {rutinaVigente ? `Rutina de ${rutinaVigente.nombre}` : 'Sin rutina asignada'}
        </h1>
        {rutinaVigente && esRutinaPersonalizada(rutinaVigente.dias) && (
          <Badge variant="outline" title="Alguno de sus días se editó solo para este alumno">
            Personalizada
          </Badge>
        )}
      </div>

      {rutinaVigente && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Ajustar rutina</h2>
          <InstanceEditor
            instancia={{ id: rutinaVigente.id, dias: diasDeRutinaAEdicion(rutinaVigente.dias) }}
            plantillas={plantillas}
            puedeRenombrar={rutinaVigente.esDueno !== false}
          />
        </section>
      )}

      <ReemplazarRutinaSection
        alumnoId={params.id}
        plantillas={plantillas}
        hayRutinaVigente={Boolean(rutinaVigente)}
      />
    </main>
  );
}
