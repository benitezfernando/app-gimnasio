'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserApiFetch, BrowserApiError } from '../../../../../lib/browser-api-client';
import { RoutineExercisesEditor } from '../../../../../components/routine-exercises-editor';
import { EjercicioEnEdicion, aPayloadDeEjercicios } from '../../../../../lib/routine-types';

interface InstanceExistente {
  id: string;
  nombre: string;
  ejercicios: EjercicioEnEdicion[];
}

export function InstanceEditor({
  alumnoId,
  instanciaVigente,
}: {
  alumnoId: string;
  instanciaVigente: InstanceExistente | null;
}) {
  const router = useRouter();
  const [nombreNueva, setNombreNueva] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Con instancia vigente: PUT sobre esa instancia (ajuste, HU-06).
  // Sin instancia vigente: primero POST /routine-instances desde cero
  // con la lista final de ejercicios (HU-05), en un solo paso — no hay
  // "crear vacía y después rellenar" porque el backend exige al menos un
  // criterio de origen en la creación.
  async function guardar(ejercicios: EjercicioEnEdicion[]) {
    setGuardando(true);
    setError(null);
    try {
      if (instanciaVigente) {
        await browserApiFetch(`routine-instances/${instanciaVigente.id}/exercises`, {
          method: 'PUT',
          body: JSON.stringify({ ejercicios: aPayloadDeEjercicios(ejercicios) }),
        });
      } else {
        await browserApiFetch('routine-instances', {
          method: 'POST',
          body: JSON.stringify({
            alumnoId,
            nombre: nombreNueva || 'Rutina personalizada',
            ejercicios: aPayloadDeEjercicios(ejercicios),
          }),
        });
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof BrowserApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {!instanciaVigente && (
        <input
          value={nombreNueva}
          onChange={(e) => setNombreNueva(e.target.value)}
          placeholder="Nombre de la rutina"
          className="min-h-11 rounded-lg border border-border bg-surface px-3 text-text placeholder:text-text-muted"
        />
      )}
      <RoutineExercisesEditor
        key={instanciaVigente?.id ?? 'nueva'}
        ejerciciosIniciales={instanciaVigente?.ejercicios ?? []}
        onGuardar={guardar}
        guardando={guardando}
        error={error}
      />
    </div>
  );
}
