import Link from 'next/link';
import { apiFetch, ApiError } from '../../../../../lib/api-client';
import { AssignTemplateForm } from './assign-template-form';
import { InstanceEditor } from './instance-editor';
import { Pill } from '../../../../../components/ui/pill';
import { LogoutButton } from '../../../../../components/logout-button';

interface TemplateOption {
  id: string;
  nombre: string;
  activa: boolean;
}

interface RutinaVigenteResponse {
  id: string;
  nombre: string;
  vinculada: boolean;
  origenTemplateId: string | null;
  origenTemplateNombre: string | null;
  ejercicios: Array<{
    exerciseId: string;
    nombre: string;
    imageUrl: string | null;
    orden: number;
    series: number;
    repeticiones: number;
    peso: number | null;
    notas: string | null;
  }>;
}

export default async function AlumnoDetailPage({ params }: { params: { id: string } }) {
  const plantillas = await apiFetch<TemplateOption[]>('/routine-templates');

  let rutinaVigente: RutinaVigenteResponse | null = null;
  try {
    rutinaVigente = await apiFetch<RutinaVigenteResponse>(`/users/${params.id}/rutina-vigente`);
  } catch (error) {
    // El backend responde 200 con el body vacío/null si no hay vigente
    // (ver GetAlumnoRutinaVigenteAsProfesorUseCase) — este catch es solo
    // para el caso de un 403/404 real (alumno fuera de cartera), que acá
    // no debería pasar porque /users/me/alumnos ya filtró la cartera.
    if (!(error instanceof ApiError)) throw error;
    rutinaVigente = null;
  }

  return (
    <main className="flex w-full flex-col gap-6 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-16">
      <div className="flex justify-end">
        <LogoutButton />
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-text">
          {rutinaVigente ? `Rutina de ${rutinaVigente.nombre}` : 'Sin rutina asignada'}
        </h1>
        {rutinaVigente?.vinculada && rutinaVigente.origenTemplateNombre && (
          <Link href={`/profesor/plantillas/${rutinaVigente.origenTemplateId}`}>
            <Pill>Vinculada a «{rutinaVigente.origenTemplateNombre}»</Pill>
          </Link>
        )}
      </div>

      {(() => {
        const seccionAsignarPlantilla = (
          <section key="asignar-plantilla" className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-text-muted">
              {rutinaVigente ? 'Reemplazar con una plantilla' : 'Asignar plantilla existente'}
            </h2>
            <AssignTemplateForm
              alumnoId={params.id}
              plantillas={plantillas}
              reemplazaRutinaVigente={Boolean(rutinaVigente)}
            />
          </section>
        );

        const seccionEjercicios = (
          <section key="ejercicios" className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-text-muted">
              {rutinaVigente ? 'Ajustar ejercicios' : 'O armar rutina desde cero'}
            </h2>
            <InstanceEditor
              alumnoId={params.id}
              instanciaVigente={
                rutinaVigente
                  ? {
                      id: rutinaVigente.id,
                      nombre: rutinaVigente.nombre,
                      ejercicios: rutinaVigente.ejercicios.map((e) => ({
                        exerciseId: e.exerciseId,
                        nombre: e.nombre,
                        imageUrl: e.imageUrl,
                        orden: e.orden,
                        series: e.series,
                        repeticiones: e.repeticiones,
                        peso: e.peso,
                        notas: e.notas,
                      })),
                    }
                  : null
              }
            />
          </section>
        );

        return rutinaVigente
          ? [seccionEjercicios, seccionAsignarPlantilla]
          : [seccionAsignarPlantilla, seccionEjercicios];
      })()}
    </main>
  );
}
