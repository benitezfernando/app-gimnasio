'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserApiFetch, BrowserApiError } from '../../../../../lib/browser-api-client';
import { PrimaryButton } from '../../../../../components/ui/primary-button';

interface TemplateOption {
  id: string;
  nombre: string;
  activa: boolean;
}

export function AssignTemplateForm({
  alumnoId,
  plantillas,
  reemplazaRutinaVigente = false,
}: {
  alumnoId: string;
  plantillas: TemplateOption[];
  reemplazaRutinaVigente?: boolean;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState('');
  const [nombre, setNombre] = useState('');
  const [asignando, setAsignando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plantillasActivas = plantillas.filter((p) => p.activa);

  async function asignar() {
    if (!templateId || !nombre.trim()) return;
    if (
      reemplazaRutinaVigente &&
      !window.confirm(
        'Esto reemplaza la rutina actual del alumno por la plantilla elegida. ¿Continuar?',
      )
    ) {
      return;
    }
    setAsignando(true);
    setError(null);
    try {
      await browserApiFetch('routine-instances', {
        method: 'POST',
        body: JSON.stringify({ alumnoId, nombre, origenTemplateId: templateId }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof BrowserApiError ? err.message : 'No se pudo asignar.');
    } finally {
      setAsignando(false);
    }
  }

  if (plantillasActivas.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        No tenés plantillas activas — armá una en{' '}
        <a href="/profesor/plantillas" className="text-accent-text underline">
          Mis plantillas
        </a>{' '}
        primero, o armá la rutina desde cero más abajo.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <select
        value={templateId}
        onChange={(e) => setTemplateId(e.target.value)}
        className="min-h-11 rounded-lg border border-border bg-surface px-3 text-text lg:min-h-9"
      >
        <option value="">Elegir plantilla...</option>
        {plantillasActivas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre de esta rutina para el alumno"
        className="min-h-11 rounded-lg border border-border bg-surface px-3 text-text placeholder:text-text-muted lg:min-h-9"
      />
      <PrimaryButton
        type="button"
        onClick={asignar}
        disabled={asignando || !templateId || !nombre.trim()}
        size="sm"
      >
        {asignando
          ? 'Asignando...'
          : reemplazaRutinaVigente
            ? 'Reemplazar rutina'
            : 'Asignar plantilla'}
      </PrimaryButton>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
