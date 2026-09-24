'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, SearchX } from 'lucide-react';
import { browserApiFetch, BrowserApiError } from '../../../lib/browser-api-client';
import { ExerciseCard, ExerciseCardData } from '../../../components/exercise-card';
import { PARTES_CUERPO, ETIQUETA_PARTE_CUERPO } from '../../../lib/region-colors';
import { EQUIPAMIENTOS, ETIQUETA_EQUIPAMIENTO } from '../../../lib/equipment-options';
import { PageHeader } from '../../../components/ui/page-header';
import { LogoutButton } from '../../../components/logout-button';
import { HomeLink } from '../../../components/ui/home-link';
import { useRoleHome } from '../../../lib/use-role-home';
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

interface ListExercisesResponse {
  items: ExerciseCardData[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const LIMITE_POR_PAGINA = 24;

export default function CatalogoPage() {
  const homeHref = useRoleHome();
  const [busqueda, setBusqueda] = useState('');
  const [parteCuerpo, setParteCuerpo] = useState<string | null>(null);
  const [equipamiento, setEquipamiento] = useState('');
  const [pagina, setPagina] = useState(1);
  const [items, setItems] = useState<ExerciseCardData[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(
    async (paginaActual: number, reemplazar: boolean) => {
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
        );
        setItems((anteriores) =>
          reemplazar ? respuesta.items : [...anteriores, ...respuesta.items],
        );
        setTotalPages(respuesta.totalPages);
        setPagina(paginaActual);
      } catch (err) {
        setError(err instanceof BrowserApiError ? err.message : 'No se pudo cargar el catálogo.');
      } finally {
        setCargando(false);
      }
    },
    [busqueda, parteCuerpo, equipamiento],
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      cargar(1, true);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [busqueda, parteCuerpo, equipamiento]);

  return (
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-5xl lg:pb-6 lg:pt-16">
      <PageHeader
        title="Catálogo de ejercicios"
        left={homeHref && <HomeLink href={homeHref} />}
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

      <div className="flex gap-2 overflow-x-auto pb-1">
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
          <Link key={ejercicio.id} href={`/catalogo/${ejercicio.id}`}>
            <ExerciseCard ejercicio={ejercicio} />
          </Link>
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
    </main>
  );
}
