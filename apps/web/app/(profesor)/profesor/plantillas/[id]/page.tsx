import { apiFetch } from '../../../../../lib/api-client';
import { LogoutButton } from '../../../../../components/logout-button';
import { BackLink } from '../../../../../components/ui/back-link';
import { HomeLink } from '../../../../../components/ui/home-link';
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
    notas: string | null;
  }>;
}

interface ExerciseSummary {
  id: string;
  nombre: string;
  imageUrl: string | null;
}

export default async function PlantillaDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const plantilla = await apiFetch<TemplateDetailResponse>(`/routine-templates/${params.id}`);

  // El detalle de plantilla no trae nombre/imageUrl de cada ejercicio —
  // se resuelven acá en UN solo llamado bulk (GET /exercises/by-ids),
  // no un GET /exercises/:id por ejercicio (hasta 50 round-trips
  // separados contra Render — medido: ~8-10s solo por esto en el caso
  // real, el cuello de botella reportado en producción).
  const ids = plantilla.ejercicios.map((e) => e.exerciseId);
  const detalles =
    ids.length > 0
      ? await apiFetch<ExerciseSummary[]>(`/exercises/by-ids?ids=${ids.join(',')}`)
      : [];
  const detallePorId = new Map(detalles.map((d) => [d.id, d]));

  const ejercicios = plantilla.ejercicios.map((e) => {
    const detalle = detallePorId.get(e.exerciseId);
    return {
      exerciseId: e.exerciseId,
      nombre: detalle?.nombre ?? '(ejercicio no encontrado)',
      imageUrl: detalle?.imageUrl ?? null,
      orden: e.orden,
      series: e.series,
      repeticiones: e.repeticiones,
      peso: e.peso,
      notas: e.notas,
    };
  });

  return (
    <main className="w-full px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-16">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center">
          <BackLink href="/profesor/plantillas" />
          <HomeLink href="/profesor" />
        </div>
        <LogoutButton />
      </div>
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
