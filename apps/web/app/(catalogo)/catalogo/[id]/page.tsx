'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Dumbbell } from 'lucide-react';
import { browserApiFetch, BrowserApiError } from '../../../../lib/browser-api-client';
import { useRoleHome } from '../../../../lib/use-role-home';
import { ETIQUETA_PARTE_CUERPO } from '../../../../lib/region-colors';
import { ETIQUETA_GRUPO_MUSCULAR } from '../../../../lib/muscle-group-options';
import { ETIQUETA_EQUIPAMIENTO } from '../../../../lib/equipment-options';
import { PageHeader } from '../../../../components/ui/page-header';
import { Pill } from '../../../../components/ui/pill';
import { LogoutButton } from '../../../../components/logout-button';
import { HomeLink } from '../../../../components/ui/home-link';

interface ExerciseDetailResponse {
  id: string;
  nombre: string;
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

export default function DetalleEjercicioPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [ejercicio, setEjercicio] = useState<ExerciseDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const homeHref = useRoleHome();

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      try {
        const respuesta = await browserApiFetch<ExerciseDetailResponse>(`/exercises/${params.id}`);
        if (!cancelado) setEjercicio(respuesta);
      } catch (err) {
        if (cancelado) return;
        setError(err instanceof BrowserApiError ? err.message : 'No se pudo cargar el ejercicio.');
      } finally {
        if (!cancelado) setCargando(false);
      }
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [params.id]);

  return (
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-16">
      {/*
        router.back() en vez de un href fijo a /catalogo — esta pantalla
        se llega tanto desde /catalogo (browse general) como desde
        /alumno (ejercicio dentro de la rutina vigente); un destino fijo
        sacaba al alumno de su rutina hacia el catálogo general en vez de
        devolverlo a donde estaba.
      */}
      <PageHeader
        title={ejercicio?.nombre ?? 'Ejercicio'}
        onBack={() => router.back()}
        left={homeHref && <HomeLink href={homeHref} />}
        right={<LogoutButton />}
      />

      {cargando && <p className="text-sm text-text-muted">Cargando...</p>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {ejercicio && (
        <>
          <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-surface-alt">
            {ejercicio.gifUrl || ejercicio.imageUrl ? (
              <Image
                src={ejercicio.gifUrl ?? ejercicio.imageUrl!}
                alt={ejercicio.nombre}
                fill
                unoptimized={Boolean(ejercicio.gifUrl)}
                sizes="(max-width: 640px) 100vw, 640px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Dumbbell className="text-text-muted" size={64} aria-hidden />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Pill>{ETIQUETA_PARTE_CUERPO[ejercicio.parteCuerpo] ?? ejercicio.parteCuerpo}</Pill>
            <Pill>
              {ETIQUETA_GRUPO_MUSCULAR[ejercicio.grupoMuscular] ?? ejercicio.grupoMuscular}
            </Pill>
            {ejercicio.equipamiento && (
              <Pill>{ETIQUETA_EQUIPAMIENTO[ejercicio.equipamiento] ?? ejercicio.equipamiento}</Pill>
            )}
            {ejercicio.gruposMuscularesSecundarios.map((g) => (
              <Pill key={g}>{ETIQUETA_GRUPO_MUSCULAR[g] ?? g}</Pill>
            ))}
          </div>

          {ejercicio.pasos.length > 0 ? (
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-text">
              {ejercicio.pasos.map((paso, indice) => (
                <li key={indice}>{paso}</li>
              ))}
            </ol>
          ) : (
            ejercicio.instrucciones && (
              <p className="text-sm text-text">{ejercicio.instrucciones}</p>
            )
          )}

          {ejercicio.atribucionMedia && (
            <p className="border-t border-border pt-3 text-xs text-text-muted">
              {ejercicio.atribucionMedia}
            </p>
          )}
        </>
      )}
    </main>
  );
}
