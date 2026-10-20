'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, SearchX } from 'lucide-react';
import { browserApiFetch, BrowserApiError } from '../../../lib/browser-api-client';
import {
  ExerciseCard,
  ExerciseCardData,
  nombreConOriginal,
} from '../../../components/exercise-card';
import { ExerciseDetailDialog } from '../../../components/exercise-detail-dialog';
import { LIMITE_POR_PAGINA, ListExercisesResponse } from './catalogo-api';
import { PARTES_CUERPO, ETIQUETA_PARTE_CUERPO } from '../../../lib/region-colors';
import { EQUIPAMIENTOS, ETIQUETA_EQUIPAMIENTO } from '../../../lib/equipment-options';
import { PageHeader } from '../../../components/ui/page-header';
import { LogoutButton } from '../../../components/logout-button';
import { HomeLink } from '../../../components/ui/home-link';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';

/**
 * La primera página (sin filtros) llega del servidor en `inicial`; la
 * búsqueda y los filtros siguen pidiéndose desde el navegador.
 */
export function CatalogoCliente({
  homeHref,
  inicial,
}: {
  homeHref: string;
  inicial: Pick<ListExercisesResponse, 'items' | 'totalPages'>;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [parteCuerpo, setParteCuerpo] = useState<string | null>(null);
  const [equipamiento, setEquipamiento] = useState('');
  const [pagina, setPagina] = useState(1);
  const [items, setItems] = useState<ExerciseCardData[]>(inicial.items);
  const [totalPages, setTotalPages] = useState(inicial.totalPages);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viendoDetalle, setViendoDetalle] = useState<ExerciseCardData | null>(null);

  // Una búsqueda nueva cancela la anterior: sin esto, una respuesta lenta de
  // un término viejo podía llegar última y pisar los resultados del actual.
  const pedidoEnCurso = useRef<AbortController | null>(null);

  const cargar = useCallback(
    async (paginaActual: number, reemplazar: boolean) => {
      pedidoEnCurso.current?.abort();
      const controlador = new AbortController();
      pedidoEnCurso.current = controlador;
      setCargando(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (busqueda) params.set('search', busqueda);
        if (parteCuerpo) params.set('parteCuerpo', parteCuerpo);
        if (equipamiento) params.set('equipamiento', equipamiento);
        params.set('page', String(paginaActual));
        params.set('limit', String(LIMITE_POR_PAGINA));

        const respuesta = await browserApiFetch<ListExercisesResponse>(
          `/exercises?${params.toString()}`,
          { signal: controlador.signal },
        );
        setItems((anteriores) =>
          reemplazar ? respuesta.items : [...anteriores, ...respuesta.items],
        );
        setTotalPages(respuesta.totalPages);
        setPagina(paginaActual);
      } catch (err) {
        if (controlador.signal.aborted) return;
        setError(err instanceof BrowserApiError ? err.message : 'No se pudo cargar el catálogo.');
      } finally {
        if (!controlador.signal.aborted) setCargando(false);
      }
    },
    [busqueda, parteCuerpo, equipamiento],
  );

  useEffect(() => () => pedidoEnCurso.current?.abort(), []);

  // La primera página sin filtros ya vino del servidor: no repetirla al montar.
  const esPrimeraCarga = useRef(true);

  useEffect(() => {
    if (esPrimeraCarga.current) {
      esPrimeraCarga.current = false;
      return;
    }
    const timeoutId = setTimeout(() => {
      cargar(1, true);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [busqueda, parteCuerpo, equipamiento]);

  return (
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-5xl lg:pb-6 lg:pt-6">
      <PageHeader
        title="Catálogo de ejercicios"
        left={<HomeLink href={homeHref} />}
        right={<LogoutButton />}
      />

      <InputGroup>
        <InputGroupAddon align="inline-start">
          <Search aria-hidden />
        </InputGroupAddon>
        <InputGroupInput
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar ejercicio..."
          aria-label="Buscar ejercicio"
        />
      </InputGroup>

      <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">
        <Button
          type="button"
          size="sm"
          variant={parteCuerpo === null ? 'brand' : 'outline'}
          onClick={() => setParteCuerpo(null)}
          className="shrink-0 rounded-full"
        >
          Todos
        </Button>
        {PARTES_CUERPO.map((parte) => (
          <Button
            key={parte}
            type="button"
            size="sm"
            variant={parteCuerpo === parte ? 'brand' : 'outline'}
            onClick={() => setParteCuerpo(parte)}
            className="shrink-0 rounded-full"
          >
            {ETIQUETA_PARTE_CUERPO[parte]}
          </Button>
        ))}
      </div>

      <NativeSelect value={equipamiento} onChange={(e) => setEquipamiento(e.target.value)}>
        <NativeSelectOption value="">Cualquier equipamiento</NativeSelectOption>
        {EQUIPAMIENTOS.map((eq) => (
          <NativeSelectOption key={eq} value={eq}>
            {ETIQUETA_EQUIPAMIENTO[eq]}
          </NativeSelectOption>
        ))}
      </NativeSelect>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((ejercicio) => (
          <button
            key={ejercicio.id}
            type="button"
            onClick={() => setViendoDetalle(ejercicio)}
            aria-label={`Ver detalle de ${ejercicio.nombre}`}
            className="rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ExerciseCard ejercicio={ejercicio} />
          </button>
        ))}
      </div>

      {items.length === 0 && !cargando && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>No se encontraron ejercicios</EmptyTitle>
            <EmptyDescription>Probá con otros filtros.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {pagina < totalPages && (
        <Button
          type="button"
          variant="outline"
          onClick={() => cargar(pagina + 1, false)}
          disabled={cargando}
          className="self-center"
        >
          {cargando && <Spinner data-icon="inline-start" />}
          {cargando ? 'Cargando...' : 'Cargar más'}
        </Button>
      )}
      {viendoDetalle && (
        <ExerciseDetailDialog
          key={viendoDetalle.id}
          exerciseId={viendoDetalle.id}
          nombre={nombreConOriginal(viendoDetalle.nombre, viendoDetalle.nombreOriginal)}
          onCerrar={() => setViendoDetalle(null)}
        />
      )}
    </main>
  );
}
