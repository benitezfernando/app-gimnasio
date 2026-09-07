'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Dumbbell } from 'lucide-react';
import { browserApiFetch, BrowserApiError } from '../../../../lib/browser-api-client';

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
  const [ejercicio, setEjercicio] = useState<ExerciseDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

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
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <Link
        href="/catalogo"
        className="flex min-h-11 w-fit items-center gap-2 text-sm text-text-muted"
      >
        <ArrowLeft size={18} aria-hidden />
        Volver al catálogo
      </Link>

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

          <h1 className="text-xl font-semibold text-text">{ejercicio.nombre}</h1>

          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-text-muted">Región</dt>
              <dd className="capitalize text-text">{ejercicio.parteCuerpo}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Músculo</dt>
              <dd className="capitalize text-text">{ejercicio.grupoMuscular}</dd>
            </div>
            {ejercicio.equipamiento && (
              <div>
                <dt className="text-text-muted">Equipamiento</dt>
                <dd className="capitalize text-text">{ejercicio.equipamiento}</dd>
              </div>
            )}
            {ejercicio.gruposMuscularesSecundarios.length > 0 && (
              <div>
                <dt className="text-text-muted">Músculos secundarios</dt>
                <dd className="capitalize text-text">
                  {ejercicio.gruposMuscularesSecundarios.join(', ')}
                </dd>
              </div>
            )}
          </dl>

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
