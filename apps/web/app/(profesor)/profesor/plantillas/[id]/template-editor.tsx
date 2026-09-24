'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { browserApiFetch, BrowserApiError } from '../../../../../lib/browser-api-client';
import { RoutineExercisesEditor } from '../../../../../components/routine-exercises-editor';
import { EjercicioEnEdicion, aPayloadDeEjercicios } from '../../../../../lib/routine-types';
import { toggleActivaAction, deleteTemplateAction } from '../actions';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useConfirm } from '@/components/confirm-dialog';

interface TemplateDetail {
  id: string;
  nombre: string;
  activa: boolean;
  ejercicios: EjercicioEnEdicion[];
}

export function TemplateEditor({ plantilla }: { plantilla: TemplateDetail }) {
  const router = useRouter();
  const confirmar = useConfirm();
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
    if (
      !(await confirmar({
        titulo: `¿Eliminar definitivamente "${plantilla.nombre}"?`,
        descripcion: 'No se puede deshacer.',
        confirmarLabel: 'Eliminar',
        destructiva: true,
      }))
    ) {
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
        <h1 className="text-xl font-semibold text-foreground">{plantilla.nombre}</h1>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={alternarActiva}>
            {plantilla.activa ? 'Desactivar' : 'Reactivar'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={eliminar}
            disabled={plantilla.activa}
            title={plantilla.activa ? 'Desactivala primero para poder eliminarla' : undefined}
            className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            Eliminar definitivamente
          </Button>
        </div>
      </div>

      {accionError && (
        <Alert variant="destructive">
          <AlertDescription>{accionError}</AlertDescription>
        </Alert>
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
