import { apiFetch, ApiError } from '../../../../lib/api-client';
import { getCurrentUser } from '../../../../lib/get-current-user';
import { homeDeRol } from '../../../../lib/role-home';
import { PageHeader } from '../../../../components/ui/page-header';
import { nombreConOriginal } from '../../../../components/exercise-card';
import { LogoutButton } from '../../../../components/logout-button';
import { HomeLink } from '../../../../components/ui/home-link';
import { BackButton } from '../../../../components/ui/back-button';
import { ExerciseDetail, ExerciseDetailBody } from '../../../../components/exercise-detail-body';
import { Alert, AlertDescription } from '@/components/ui/alert';

/**
 * Server Component: el ejercicio llega en el HTML, sin el ida y vuelta
 * extra navegador → proxy → API que hacía la versión cliente. El usuario
 * ya lo pidió el layout (`getCurrentUser` está memoizado por request).
 */
export default async function DetalleEjercicioPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const [usuario, resultado] = await Promise.all([
    getCurrentUser(),
    apiFetch<ExerciseDetail>(`/exercises/${id}`).then(
      (ejercicio) => ({ ejercicio, error: null }),
      (err: unknown) => {
        if (!(err instanceof ApiError)) throw err;
        return { ejercicio: null, error: err.message };
      },
    ),
  ]);
  const { ejercicio, error } = resultado;

  return (
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-6">
      {/*
        Volver con router.back() en vez de un href fijo a /catalogo — esta
        pantalla se llega tanto desde /catalogo como desde /alumno
        (ejercicio dentro de la rutina vigente); un destino fijo sacaba al
        alumno de su rutina hacia el catálogo general.
      */}
      <PageHeader
        title={
          ejercicio ? nombreConOriginal(ejercicio.nombre, ejercicio.nombreOriginal) : 'Ejercicio'
        }
        left={
          <>
            <BackButton />
            <HomeLink href={homeDeRol(usuario.role)} />
          </>
        }
        right={<LogoutButton />}
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {ejercicio && <ExerciseDetailBody ejercicio={ejercicio} />}
    </main>
  );
}
