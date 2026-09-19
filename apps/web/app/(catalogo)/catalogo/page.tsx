'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { browserApiFetch, BrowserApiError } from '../../../lib/browser-api-client';
import { ExerciseCard, ExerciseCardData } from '../../../components/exercise-card';
import { PARTES_CUERPO, ETIQUETA_PARTE_CUERPO } from '../../../lib/region-colors';
import { EQUIPAMIENTOS, ETIQUETA_EQUIPAMIENTO } from '../../../lib/equipment-options';
import { PageHeader } from '../../../components/ui/page-header';
import { LogoutButton } from '../../../components/logout-button';
import { HomeLink } from '../../../components/ui/home-link';
import { useRoleHome } from '../../../lib/use-role-home';

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

      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3">
        <Search size={18} className="text-text-muted" aria-hidden />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar ejercicio..."
          className="min-h-11 w-full bg-transparent text-base text-text outline-none placeholder:text-text-muted lg:min-h-9 lg:text-sm"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setParteCuerpo(null)}
          className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium lg:min-h-9 lg:px-3 ${
            parteCuerpo === null
              ? 'border-accent bg-gradient-accent text-accent-fg'
              : 'border-border bg-surface text-text'
          }`}
        >
          Todos
        </button>
        {PARTES_CUERPO.map((parte) => (
          <button
            key={parte}
            type="button"
            onClick={() => setParteCuerpo(parte)}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium lg:min-h-9 lg:px-3 ${
              parteCuerpo === parte
                ? 'border-accent bg-gradient-accent text-accent-fg'
                : 'border-border bg-surface text-text'
            }`}
          >
            {ETIQUETA_PARTE_CUERPO[parte]}
          </button>
        ))}
      </div>

      <select
        value={equipamiento}
        onChange={(e) => setEquipamiento(e.target.value)}
        className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base text-text lg:min-h-9 lg:text-sm"
      >
        <option value="">Cualquier equipamiento</option>
        {EQUIPAMIENTOS.map((eq) => (
          <option key={eq} value={eq}>
            {ETIQUETA_EQUIPAMIENTO[eq]}
          </option>
        ))}
      </select>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((ejercicio) => (
          <Link key={ejercicio.id} href={`/catalogo/${ejercicio.id}`}>
            <ExerciseCard ejercicio={ejercicio} />
          </Link>
        ))}
      </div>

      {items.length === 0 && !cargando && (
        <p className="py-8 text-center text-sm text-text-muted">
          No se encontraron ejercicios con esos filtros.
        </p>
      )}

      {pagina < totalPages && (
        <button
          type="button"
          onClick={() => cargar(pagina + 1, false)}
          disabled={cargando}
          className="min-h-11 self-center rounded-lg border border-border px-6 text-sm font-medium text-text disabled:opacity-50 lg:min-h-9"
        >
          {cargando ? 'Cargando...' : 'Cargar más'}
        </button>
      )}
    </main>
  );
}
