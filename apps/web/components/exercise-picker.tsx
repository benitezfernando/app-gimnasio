'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { browserApiFetch, BrowserApiError } from '../lib/browser-api-client';
import { ExerciseCardData } from './exercise-card';

interface ListExercisesResponse {
  items: ExerciseCardData[];
  total: number;
  totalPages: number;
}

/**
 * Buscador reusado del catálogo (Bloque 2), simplificado: sin filtros de
 * región/equipamiento, solo texto — el profesor ya sabe qué está
 * buscando al armar una rutina. Al elegir un resultado, se lo agrega a
 * la lista vía `onAgregar` y el buscador se limpia solo.
 */
export function ExercisePicker({
  onAgregar,
}: {
  onAgregar: (ejercicio: ExerciseCardData) => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<ExerciseCardData[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (busqueda.trim().length < 2) {
      setResultados([]);
      return;
    }
    const timeoutId = setTimeout(async () => {
      setCargando(true);
      setError(null);
      try {
        const respuesta = await browserApiFetch<ListExercisesResponse>(
          `exercises?search=${encodeURIComponent(busqueda)}&limit=10`,
        );
        setResultados(respuesta.items);
      } catch (err) {
        setError(err instanceof BrowserApiError ? err.message : 'No se pudo buscar.');
      } finally {
        setCargando(false);
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [busqueda]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3">
        <Search size={18} className="text-text-muted" aria-hidden />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar ejercicio para agregar..."
          className="min-h-11 w-full bg-transparent text-base text-text outline-none placeholder:text-text-muted"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {resultados.length > 0 && (
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-border bg-surface p-2">
          {resultados.map((ejercicio) => (
            <li key={ejercicio.id}>
              <button
                type="button"
                onClick={() => {
                  onAgregar(ejercicio);
                  setBusqueda('');
                  setResultados([]);
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-surface-alt"
              >
                <span className="text-sm text-text">{ejercicio.nombre}</span>
                <span className="text-xs capitalize text-text-muted">{ejercicio.parteCuerpo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!cargando && busqueda.trim().length >= 2 && resultados.length === 0 && !error && (
        <p className="text-sm text-text-muted">Sin resultados.</p>
      )}
    </div>
  );
}
