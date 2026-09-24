'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserApiFetch, BrowserApiError } from '../../../../../lib/browser-api-client';
import { RoutineDaysEditor } from '../../../../../components/routine-days-editor';
import { DiaEnEdicion } from '../../../../../lib/routine-types';
import { aPayloadDeDias, claveDeVersion } from '../../../../../lib/routine-days';
import { Alert, AlertDescription } from '@/components/ui/alert';

function textoDesvinculados(numeros: number[]): string {
  if (numeros.length === 1)
    return `El Día ${numeros[0]} dejó de estar sincronizado con su plantilla.`;
  const lista = `${numeros.slice(0, -1).join(', ')} y ${numeros[numeros.length - 1]}`;
  return `Los días ${lista} dejaron de estar sincronizados con su plantilla.`;
}

export function InstanceEditor({
  instancia,
  plantillas,
}: {
  instancia: { id: string; dias: DiaEnEdicion[] };
  plantillas: Array<{ id: string; nombre: string }>;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function guardar(dias: DiaEnEdicion[], { vincular }: { vincular: boolean }) {
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const { diasDesvinculados } = await browserApiFetch<{ diasDesvinculados: number[] }>(
        `routine-instances/${instancia.id}/dias`,
        {
          method: 'PUT',
          body: JSON.stringify({ dias: aPayloadDeDias(dias, { vincular, incluirIds: true }) }),
        },
      );
      if (diasDesvinculados.length > 0) setAviso(textoDesvinculados(diasDesvinculados));
      router.refresh();
    } catch (err) {
      setError(err instanceof BrowserApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {aviso && (
        <Alert>
          <AlertDescription>{aviso}</AlertDescription>
        </Alert>
      )}
      <RoutineDaysEditor
        key={claveDeVersion(instancia.dias)}
        diasIniciales={instancia.dias}
        onGuardar={guardar}
        guardando={guardando}
        error={error}
        textoGuardar="Guardar rutina"
        importacion={{ plantillas }}
      />
    </div>
  );
}
