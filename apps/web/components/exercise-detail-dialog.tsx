'use client';

import { useEffect, useState } from 'react';
import { browserApiFetch, BrowserApiError } from '../lib/browser-api-client';
import { ExerciseDetail, ExerciseDetailBody } from './exercise-detail-body';
import { nombreConOriginal } from './exercise-card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';

/**
 * Detalle del ejercicio encima del editor de plantillas/rutinas: el editor
 * guarda recién al tocar "Guardar", así que navegar a `/catalogo/[id]`
 * perdería los cambios sin guardar.
 */
export function ExerciseDetailDialog({
  exerciseId,
  nombre,
  onCerrar,
}: {
  exerciseId: string;
  /** Nombre ya conocido por el editor, para el título mientras carga. */
  nombre: string;
  onCerrar: () => void;
}) {
  const [ejercicio, setEjercicio] = useState<ExerciseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controlador = new AbortController();
    browserApiFetch<ExerciseDetail>(`exercises/${exerciseId}`, { signal: controlador.signal })
      .then(setEjercicio)
      .catch((err: unknown) => {
        if (controlador.signal.aborted) return;
        setError(err instanceof BrowserApiError ? err.message : 'No se pudo cargar el ejercicio.');
      });
    return () => controlador.abort();
  }, [exerciseId]);

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {ejercicio ? nombreConOriginal(ejercicio.nombre, ejercicio.nombreOriginal) : nombre}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!ejercicio && !error && (
          <div className="flex justify-center py-8">
            <Spinner aria-label="Cargando ejercicio" />
          </div>
        )}
        {ejercicio && (
          <div className="flex flex-col gap-4">
            <ExerciseDetailBody ejercicio={ejercicio} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
