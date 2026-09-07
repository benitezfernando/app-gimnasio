import { apiFetch, ApiError } from '../../../../../lib/api-client';
import { AssignTemplateForm } from './assign-template-form';
import { InstanceEditor } from './instance-editor';

interface TemplateOption {
  id: string;
  nombre: string;
  activa: boolean;
}

interface RutinaVigenteResponse {
  id: string;
  nombre: string;
  ejercicios: Array<{
    exerciseId: string;
    nombre: string;
    imageUrl: string | null;
    orden: number;
    series: number;
    repeticiones: number;
    peso: number | null;
    descanso: number;
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
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold text-text">
        {rutinaVigente ? `Rutina de ${rutinaVigente.nombre}` : 'Sin rutina asignada'}
      </h1>

      {!rutinaVigente && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-text-muted">Asignar plantilla existente</h2>
          <AssignTemplateForm alumnoId={params.id} plantillas={plantillas} />
        </section>
      )}

      <section className="flex flex-col gap-3">
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
                    descanso: e.descanso,
                    notas: e.notas,
                  })),
                }
              : null
          }
        />
      </section>
    </main>
  );
}
