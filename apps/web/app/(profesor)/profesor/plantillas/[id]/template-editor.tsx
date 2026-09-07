'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { browserApiFetch, BrowserApiError } from '../../../../../lib/browser-api-client';
import { RoutineExercisesEditor } from '../../../../../components/routine-exercises-editor';
import { EjercicioEnEdicion, aPayloadDeEjercicios } from '../../../../../lib/routine-types';
import { toggleActivaAction, deleteTemplateAction } from '../actions';

interface TemplateDetail {
  id: string;
  nombre: string;
  activa: boolean;
  ejercicios: EjercicioEnEdicion[];
}

export function TemplateEditor({ plantilla }: { plantilla: TemplateDetail }) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accionError, setAccionError] = useState<string | null>(null);

  async function guardarEjercicios(ejercicios: EjercicioEnEdicion[]) {
    setGuardando(true);
    setError(null);
    try {
      await browserApiFetch(`routine-templates/${plantilla.id}/exercises`, {
        method: 'PUT',
        body: JSON.stringify({ ejercicios: aPayloadDeEjercicios(ejercicios) }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof BrowserApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  async function alternarActiva() {
    setAccionError(null);
    const resultado = await toggleActivaAction(plantilla.id, !plantilla.activa);
    if (resultado.error) setAccionError(resultado.error);
  }

  async function eliminar() {
    if (plantilla.activa) return;
    if (!window.confirm(`¿Eliminar definitivamente "${plantilla.nombre}"? No se puede deshacer.`)) {
      return;
    }
    setAccionError(null);
    const resultado = await deleteTemplateAction(plantilla.id);
    if (resultado.error) {
      setAccionError(resultado.error);
    } else {
      router.push('/profesor/plantillas');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">{plantilla.nombre}</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={alternarActiva}
            className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium text-text"
          >
            {plantilla.activa ? 'Desactivar' : 'Reactivar'}
          </button>
          <button
            type="button"
            onClick={eliminar}
            disabled={plantilla.activa}
            title={plantilla.activa ? 'Desactivala primero para poder eliminarla' : undefined}
            className="min-h-11 rounded-lg border border-danger/30 px-4 text-sm font-medium text-danger disabled:opacity-40"
          >
            Eliminar definitivamente
          </button>
        </div>
      </div>

      {accionError && (
        <p role="alert" className="text-sm text-danger">
          {accionError}
        </p>
      )}

      <RoutineExercisesEditor
        ejerciciosIniciales={plantilla.ejercicios}
        onGuardar={guardarEjercicios}
        guardando={guardando}
        error={error}
      />
    </div>
  );
}
