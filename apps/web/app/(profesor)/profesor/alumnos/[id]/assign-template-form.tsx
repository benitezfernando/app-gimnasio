'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserApiFetch, BrowserApiError } from '../../../../../lib/browser-api-client';

interface TemplateOption {
  id: string;
  nombre: string;
  activa: boolean;
}

export function AssignTemplateForm({
  alumnoId,
  plantillas,
}: {
  alumnoId: string;
  plantillas: TemplateOption[];
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState('');
  const [nombre, setNombre] = useState('');
  const [asignando, setAsignando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plantillasActivas = plantillas.filter((p) => p.activa);

  async function asignar() {
    if (!templateId || !nombre.trim()) return;
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
        <a href="/profesor/plantillas" className="text-accent underline">
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
        className="min-h-11 rounded-lg border border-border bg-surface px-3 text-text"
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
        className="min-h-11 rounded-lg border border-border bg-surface px-3 text-text placeholder:text-text-muted"
      />
      <button
        type="button"
        onClick={asignar}
        disabled={asignando || !templateId || !nombre.trim()}
        className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50"
      >
        {asignando ? 'Asignando...' : 'Asignar plantilla'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
