import { apiFetch } from '../../../../../lib/api-client';
import { TemplateEditor } from './template-editor';

interface TemplateDetailResponse {
  id: string;
  gymId: string;
  profesorId: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  ejercicios: Array<{
    exerciseId: string;
    orden: number;
    series: number;
    repeticiones: number;
    peso: number | null;
    descanso: number;
    notas: string | null;
  }>;
}

interface ExerciseSummary {
  id: string;
  nombre: string;
  imageUrl: string | null;
}

export default async function PlantillaDetailPage({ params }: { params: { id: string } }) {
  const plantilla = await apiFetch<TemplateDetailResponse>(`/routine-templates/${params.id}`);

  // El detalle de plantilla no trae nombre/imageUrl de cada ejercicio —
  // se resuelven acá con una consulta por ejercicio al catálogo (son a
  // lo sumo 50, y esto corre server-side una sola vez al abrir la
  // página, no en cada interacción del editor).
  const ejercicios = await Promise.all(
    plantilla.ejercicios.map(async (e) => {
      const detalle = await apiFetch<ExerciseSummary>(`/exercises/${e.exerciseId}`);
      return {
        exerciseId: e.exerciseId,
        nombre: detalle.nombre,
        imageUrl: detalle.imageUrl,
        orden: e.orden,
        series: e.series,
        repeticiones: e.repeticiones,
        peso: e.peso,
        descanso: e.descanso,
        notas: e.notas,
      };
    }),
  );

  return (
    <main className="mx-auto max-w-2xl p-4">
      <TemplateEditor
        plantilla={{
          id: plantilla.id,
          nombre: plantilla.nombre,
          activa: plantilla.activa,
          ejercicios,
        }}
      />
    </main>
  );
}
