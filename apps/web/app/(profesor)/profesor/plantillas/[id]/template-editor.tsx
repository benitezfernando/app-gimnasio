'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { browserApiFetch, BrowserApiError } from '../../../../../lib/browser-api-client';
import { RoutineDaysEditor } from '../../../../../components/routine-days-editor';
import { DiaEnEdicion } from '../../../../../lib/routine-types';
import { aPayloadDeDias, claveDeVersion } from '../../../../../lib/routine-days';
import { toggleActivaAction, deleteTemplateAction } from '../actions';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useConfirm } from '@/components/confirm-dialog';

interface TemplateDetail {
  id: string;
  nombre: string;
  activa: boolean;
  dias: DiaEnEdicion[];
}

export function TemplateEditor({ plantilla }: { plantilla: TemplateDetail }) {
  const router = useRouter();
  const confirmar = useConfirm();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accionError, setAccionError] = useState<string | null>(null);
  const [desyncAviso, setDesyncAviso] = useState<string | null>(null);

  async function guardarDias(dias: DiaEnEdicion[]) {
    setGuardando(true);
    setError(null);
    setDesyncAviso(null);
    try {
      const { alumnosDesincronizados } = await browserApiFetch<{
        alumnosDesincronizados: string[];
      }>(`routine-templates/${plantilla.id}/dias`, {
        method: 'PUT',
        body: JSON.stringify({ dias: aPayloadDeDias(dias, { vincular: false, incluirIds: true }) }),
      });
      if (alumnosDesincronizados.length > 0) {
        setDesyncAviso(
          alumnosDesincronizados.length === 1
            ? 'Un alumno vinculado superaba el límite de 50 ejercicios y quedó desincronizado de esta plantilla.'
            : `${alumnosDesincronizados.length} alumnos vinculados superaban el límite de 50 ejercicios y quedaron desincronizados de esta plantilla.`,
        );
      }
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

      {desyncAviso && (
        <Alert>
          <AlertDescription>{desyncAviso}</AlertDescription>
        </Alert>
      )}

      <RoutineDaysEditor
        key={claveDeVersion(plantilla.dias)}
        diasIniciales={plantilla.dias}
        onGuardar={guardarDias}
        guardando={guardando}
        error={error}
        textoGuardar="Guardar plantilla"
      />
    </div>
  );
}
