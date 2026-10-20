import { apiFetch } from '../../../../../lib/api-client';
import { LogoutButton } from '../../../../../components/logout-button';
import { BackLink } from '../../../../../components/ui/back-link';
import { HomeLink } from '../../../../../components/ui/home-link';
import { TemplateEditor } from './template-editor';
import { TemplateDetailApi } from '../../../../../lib/routine-types';
import { diasDePlantillaAEdicion } from '../../../../../lib/routine-days';
import { getCurrentUser } from '../../../../../lib/get-current-user';
import { GuiaDePantalla } from '../../../../../components/guia-de-pantalla';
import { GUIA_EDITOR_RUTINA } from '../../../../../lib/guias-contenido';

interface ExerciseSummary {
  id: string;
  nombre: string;
  nombreCatalogo?: string | null;
  imageUrl: string | null;
}

export default async function PlantillaDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const plantilla = await apiFetch<TemplateDetailApi>(`/routine-templates/${params.id}`);
  const usuario = await getCurrentUser();

  // El detalle de plantilla no trae nombre/imageUrl de cada ejercicio —
  // se resuelven acá en UN solo llamado bulk (GET /exercises/by-ids),
  // no un GET /exercises/:id por ejercicio (hasta 50 round-trips
  // separados contra Render — medido: ~8-10s solo por esto en el caso
  // real, el cuello de botella reportado en producción).
  const ids = [...new Set(plantilla.dias.flatMap((d) => d.ejercicios.map((e) => e.exerciseId)))];
  const detalles =
    ids.length > 0
      ? await apiFetch<ExerciseSummary[]>(`/exercises/by-ids?ids=${ids.join(',')}`)
      : [];
  const dias = diasDePlantillaAEdicion(plantilla.dias, new Map(detalles.map((d) => [d.id, d])));

  return (
    <main className="w-full px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-6">
      <GuiaDePantalla userId={usuario.id} guias={[GUIA_EDITOR_RUTINA]} />
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center">
          <BackLink href="/profesor/plantillas" />
          <HomeLink href="/profesor" />
        </div>
        <LogoutButton />
      </div>
      <TemplateEditor
        plantilla={{ id: plantilla.id, nombre: plantilla.nombre, activa: plantilla.activa, dias }}
      />
    </main>
  );
}
