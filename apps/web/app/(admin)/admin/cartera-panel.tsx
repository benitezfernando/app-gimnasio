'use client';

import { useState } from 'react';
import { browserApiFetch, BrowserApiError } from '../../../lib/browser-api-client';
import { assignProfesorAction, removeProfesorAction } from './actions';

interface UserRow {
  id: string;
  username: string;
  nombre: string;
  role: 'ADMIN' | 'PROFESOR' | 'ALUMNO';
  activo: boolean;
}

/**
 * Panel de gestión de cartera de un alumno (HU-03b), colgado de cada fila
 * de `UsersList`. Carga los profesores asignados on-demand al abrirse, vía
 * `browserApiFetch` — primer consumidor real del proxy `/api/proxy/*`
 * (deuda técnica anotada en HLD §6, saldada con el test de la Tarea 7).
 * Asignar/quitar van por Server Actions (mismo patrón que
 * `deactivateUserAction`); como la lista de acá abajo no sale de las
 * props del Server Component, se recarga a mano después de cada mutación
 * — `revalidatePath('/admin')` no llega a este estado local.
 */
export function CarteraPanel({
  alumno,
  profesoresDelGym,
}: {
  alumno: UserRow;
  profesoresDelGym: UserRow[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [asignados, setAsignados] = useState<UserRow[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profesorSeleccionado, setProfesorSeleccionado] = useState('');

  async function cargarAsignados() {
    setCargando(true);
    setError(null);
    try {
      const datos = await browserApiFetch<UserRow[]>(`users/${alumno.id}/profesores`);
      setAsignados(datos);
    } catch (err) {
      setError(err instanceof BrowserApiError ? err.message : 'Error cargando profesores.');
    } finally {
      setCargando(false);
    }
  }

  function toggle() {
    const siguiente = !abierto;
    setAbierto(siguiente);
    if (siguiente && asignados === null) {
      void cargarAsignados();
    }
  }

  async function asignar() {
    if (!profesorSeleccionado) return;
    setError(null);
    const resultado = await assignProfesorAction(alumno.id, profesorSeleccionado);
    if (resultado.error) {
      setError(resultado.error);
      return;
    }
    setProfesorSeleccionado('');
    await cargarAsignados();
  }

  async function quitar(profesorId: string) {
    setError(null);
    const resultado = await removeProfesorAction(alumno.id, profesorId);
    if (resultado.error) {
      setError(resultado.error);
      return;
    }
    await cargarAsignados();
  }

  const idsAsignados = new Set((asignados ?? []).map((p) => p.id));
  const disponibles = profesoresDelGym.filter((p) => !idsAsignados.has(p.id));

  return (
    <div className="mt-2">
      <button
        onClick={toggle}
        className="text-sm font-medium text-accent underline-offset-2 hover:underline"
      >
        Profesores {abierto ? '▲' : '▼'}
      </button>

      {abierto && (
        <div className="mt-2 rounded-lg border border-border bg-surface-alt p-3">
          {cargando && <p className="text-sm text-text-muted">Cargando...</p>}
          {error && (
            <p role="alert" className="mb-2 text-sm text-danger">
              {error}
            </p>
          )}

          {!cargando && asignados !== null && (
            <ul className="flex flex-col gap-2">
              {asignados.length === 0 && (
                <li className="text-sm text-text-muted">Sin profesores asignados</li>
              )}
              {asignados.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-text">{p.nombre}</span>
                  <button
                    onClick={() => quitar(p.id)}
                    aria-label={`Quitar a ${p.nombre}`}
                    className="min-h-8 min-w-8 rounded-full text-danger hover:bg-surface"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!cargando && asignados !== null && disponibles.length > 0 && (
            <div className="mt-3 flex gap-2">
              <select
                value={profesorSeleccionado}
                onChange={(e) => setProfesorSeleccionado(e.target.value)}
                className="min-h-11 flex-1 rounded-lg border border-border bg-surface px-3 text-base text-text"
              >
                <option value="">Elegir profesor...</option>
                {disponibles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
              <button
                onClick={asignar}
                disabled={!profesorSeleccionado}
                className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50"
              >
                Asignar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
