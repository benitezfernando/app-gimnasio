'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { browserApiFetch, BrowserApiError } from '../lib/browser-api-client';
import { ETIQUETA_PARTE_CUERPO } from '../lib/region-colors';
import { ExerciseCardData, nombreConOriginal } from './exercise-card';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <Search aria-hidden />
        </InputGroupAddon>
        <InputGroupInput
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar ejercicio para agregar..."
          aria-label="Buscar ejercicio para agregar"
        />
      </InputGroup>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {resultados.length > 0 && (
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-border bg-popover p-2">
          {resultados.map((ejercicio) => (
            <li key={ejercicio.id}>
              <Button
                type="button"
                variant="ghost"
                className="h-auto min-h-11 w-full justify-start gap-3 px-2 py-2 text-left whitespace-normal lg:h-auto"
                onClick={() => {
                  onAgregar(ejercicio);
                  setBusqueda('');
                  setResultados([]);
                }}
              >
                <span className="text-sm text-foreground">
                  {nombreConOriginal(ejercicio.nombre, ejercicio.nombreOriginal)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {ETIQUETA_PARTE_CUERPO[ejercicio.parteCuerpo] ?? ejercicio.parteCuerpo}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      {!cargando && busqueda.trim().length >= 2 && resultados.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">Sin resultados.</p>
      )}
    </div>
  );
}
