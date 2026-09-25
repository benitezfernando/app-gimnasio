'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserApiFetch, BrowserApiError } from '../../../../../lib/browser-api-client';
import { RoutineDaysEditor } from '../../../../../components/routine-days-editor';
import { DiaEnEdicion } from '../../../../../lib/routine-types';
import { aPayloadDeDias } from '../../../../../lib/routine-days';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { useConfirm } from '@/components/confirm-dialog';

export function NewRoutineForm({
  alumnoId,
  plantillas,
  reemplazaRutinaVigente,
}: {
  alumnoId: string;
  plantillas: Array<{ id: string; nombre: string }>;
  reemplazaRutinaVigente: boolean;
}) {
  const router = useRouter();
  const confirmar = useConfirm();
  const [nombre, setNombre] = useState('');
  const [version, setVersion] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function asignar(dias: DiaEnEdicion[], { vincular }: { vincular: boolean }) {
    if (!nombre.trim()) {
      setError('Poné un nombre para la rutina.');
      return;
    }
    if (
      reemplazaRutinaVigente &&
      !(await confirmar({
        titulo: '¿Reemplazar la rutina actual?',
        descripcion: 'La rutina actual del alumno pasa al historial y queda esta como vigente.',
        confirmarLabel: 'Reemplazar',
      }))
    ) {
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await browserApiFetch('routine-instances', {
        method: 'POST',
        body: JSON.stringify({
          alumnoId,
          nombre: nombre.trim(),
          dias: aPayloadDeDias(dias, { vincular, incluirIds: false }),
        }),
      });
      setNombre('');
      setVersion((v) => v + 1);
      router.refresh();
    } catch (err) {
      setError(err instanceof BrowserApiError ? err.message : 'No se pudo asignar.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel htmlFor="nueva-rutina-nombre" className="sr-only">
          Nombre de la rutina
        </FieldLabel>
        <Input
          id="nueva-rutina-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre de la rutina"
        />
      </Field>
      <RoutineDaysEditor
        key={version}
        diasIniciales={[]}
        onGuardar={asignar}
        guardando={guardando}
        error={error}
        textoGuardar={reemplazaRutinaVigente ? 'Reemplazar rutina' : 'Asignar rutina'}
        permiteGuardarVacio={false}
        importacion={{
          plantillas,
          onPlantillaCompletaImportada: (nombrePlantilla) =>
            setNombre((actual) => (actual.trim() ? actual : nombrePlantilla)),
        }}
      />
    </div>
  );
}
