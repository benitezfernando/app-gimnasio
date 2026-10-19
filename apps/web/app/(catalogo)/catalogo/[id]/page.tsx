import Image from 'next/image';
import { Dumbbell } from 'lucide-react';
import { apiFetch, ApiError } from '../../../../lib/api-client';
import { getCurrentUser } from '../../../../lib/get-current-user';
import { homeDeRol } from '../../../../lib/role-home';
import { ETIQUETA_PARTE_CUERPO } from '../../../../lib/region-colors';
import { ETIQUETA_GRUPO_MUSCULAR } from '../../../../lib/muscle-group-options';
import { ETIQUETA_EQUIPAMIENTO } from '../../../../lib/equipment-options';
import { PageHeader } from '../../../../components/ui/page-header';
import { nombreConOriginal } from '../../../../components/exercise-card';
import { LogoutButton } from '../../../../components/logout-button';
import { HomeLink } from '../../../../components/ui/home-link';
import { BackButton } from '../../../../components/ui/back-button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ExerciseDetailResponse {
  id: string;
  nombre: string;
  nombreOriginal: string | null;
  imageUrl: string | null;
  gifUrl: string | null;
  parteCuerpo: string;
  grupoMuscular: string;
  gruposMuscularesSecundarios: string[];
  equipamiento: string | null;
  instrucciones: string | null;
  pasos: string[];
  atribucionMedia: string | null;
}

/**
 * Server Component: el ejercicio llega en el HTML, sin el ida y vuelta
 * extra navegador → proxy → API que hacía la versión cliente. El usuario
 * ya lo pidió el layout (`getCurrentUser` está memoizado por request).
 */
export default async function DetalleEjercicioPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const [usuario, resultado] = await Promise.all([
    getCurrentUser(),
    apiFetch<ExerciseDetailResponse>(`/exercises/${id}`).then(
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

      {ejercicio && (
        <>
          {/*
            La media del catálogo mide 180×180 px: estirada al ancho de la
            columna (~640 px, 3,6×) se ve borrosa. Tope en 360 px = 2× el
            original, el máximo que todavía se ve nítido. En celular, 75% del
            ancho (~1,4× en un teléfono de 375 px) para ganar nitidez.
          */}
          <div className="relative mx-auto aspect-square w-3/4 self-center max-w-[360px] overflow-hidden rounded-xl bg-card sm:w-full">
            {ejercicio.gifUrl || ejercicio.imageUrl ? (
              <Image
                src={ejercicio.gifUrl ?? ejercicio.imageUrl!}
                alt={ejercicio.nombre}
                fill
                unoptimized
                sizes="(max-width: 640px) 75vw, 360px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Dumbbell className="text-muted-foreground" size={64} aria-hidden />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {ETIQUETA_PARTE_CUERPO[ejercicio.parteCuerpo] ?? ejercicio.parteCuerpo}
            </Badge>
            <Badge variant="outline">
              {ETIQUETA_GRUPO_MUSCULAR[ejercicio.grupoMuscular] ?? ejercicio.grupoMuscular}
            </Badge>
            {ejercicio.equipamiento && (
              <Badge variant="outline">
                {ETIQUETA_EQUIPAMIENTO[ejercicio.equipamiento] ?? ejercicio.equipamiento}
              </Badge>
            )}
            {ejercicio.gruposMuscularesSecundarios.map((g) => (
              <Badge variant="outline" key={g}>
                {ETIQUETA_GRUPO_MUSCULAR[g] ?? g}
              </Badge>
            ))}
          </div>

          {ejercicio.pasos.length > 0 ? (
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-foreground">
              {ejercicio.pasos.map((paso, indice) => (
                <li key={indice}>{paso}</li>
              ))}
            </ol>
          ) : (
            ejercicio.instrucciones && (
              <p className="text-sm text-foreground">{ejercicio.instrucciones}</p>
            )
          )}

          {ejercicio.atribucionMedia && (
            <p className="border-t border-border pt-3 text-xs text-muted-foreground">
              {ejercicio.atribucionMedia}
            </p>
          )}
        </>
      )}
    </main>
  );
}
