'use client';

import { useEffect, useState } from 'react';
import { browserApiFetch, BrowserApiError } from '../../../lib/browser-api-client';
import { deletePermanentlyAction } from './actions';

interface DeletionImpact {
  plantillasABorrar: number;
  instanciasABorrar: number;
  instanciasQueSobreviven: number;
  vinculosDeCarteraABorrar: number;
}

/**
 * HU-03c: nunca un window.confirm genérico para esta acción — el Admin
 * tiene que ver el impacto real antes de poder confirmar (la cascada de
 * un PROFESOR no es predecible de memoria).
 */
export function DeletePermanentlyDialog({
  userId,
  nombre,
  onCerrado,
}: {
  userId: string;
  nombre: string;
  onCerrado: () => void;
}) {
  const [impacto, setImpacto] = useState<DeletionImpact | null>(null);
  const [cargando, setCargando] = useState(true);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advertencia, setAdvertencia] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    async function cargarImpacto() {
      try {
        const respuesta = await browserApiFetch<DeletionImpact>(`users/${userId}/deletion-impact`);
        if (!cancelado) setImpacto(respuesta);
      } catch (err) {
        if (cancelado) return;
        setError(err instanceof BrowserApiError ? err.message : 'No se pudo calcular el impacto.');
      } finally {
        if (!cancelado) setCargando(false);
      }
    }
    cargarImpacto();
    return () => {
      cancelado = true;
    };
  }, [userId]);

  async function confirmar() {
    setEliminando(true);
    setError(null);
    const resultado = await deletePermanentlyAction(userId);
    if (resultado.error) {
      setError(resultado.error);
      setEliminando(false);
      return;
    }
    if (resultado.advertencia) {
      setAdvertencia(resultado.advertencia);
      setEliminando(false);
      return;
    }
    onCerrado();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-surface p-4">
        <h2 className="text-lg font-semibold text-text">Eliminar a {nombre} definitivamente</h2>

        {cargando && <p className="text-sm text-text-muted">Calculando impacto...</p>}

        {impacto && (
          <ul className="flex flex-col gap-1 text-sm text-text">
            <li>Plantillas que se borran: {impacto.plantillasABorrar}</li>
            <li>Rutinas de alumnos que se borran: {impacto.instanciasABorrar}</li>
            <li>
              Rutinas que sobreviven (alumno con otro profesor): {impacto.instanciasQueSobreviven}
            </li>
            <li>Vínculos de cartera que se borran: {impacto.vinculosDeCarteraABorrar}</li>
          </ul>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {advertencia && (
          <p role="alert" className="text-sm text-danger">
            {advertencia}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCerrado}
            className="min-h-11 flex-1 rounded-lg border border-border px-4 text-sm font-medium text-text"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={cargando || eliminando || !impacto}
            className="min-h-11 flex-1 rounded-lg bg-danger px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {eliminando ? 'Eliminando...' : 'Eliminar definitivamente'}
          </button>
        </div>
      </div>
    </div>
  );
}
