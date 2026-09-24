import { Dumbbell } from 'lucide-react';
import { apiFetch, ApiError } from '../../../lib/api-client';
import { PageHeader } from '../../../components/ui/page-header';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { LogoutButton } from '../../../components/logout-button';
import { ListaEjerciciosDelDia, EjercicioDeRutina } from './lista-ejercicios-del-dia';
import { SelectorDeDias } from './selector-de-dias';

interface RutinaVigenteResponse {
  id: string;
  nombre: string;
  dias: Array<{ numero: number; ejercicios: EjercicioDeRutina[] }>;
}

export default async function AlumnoPage() {
  let rutina: RutinaVigenteResponse | null = null;
  try {
    rutina = await apiFetch<RutinaVigenteResponse>('/users/me/rutina-vigente');
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    rutina = null;
  }

  if (!rutina || rutina.dias.length === 0) {
    return (
      <main className="flex w-full flex-col items-center gap-2 px-8 pb-28 pt-8 text-center sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-16">
        <PageHeader title="Rutina" right={<LogoutButton />} />
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Dumbbell />
            </EmptyMedia>
            <EmptyTitle>
              {rutina
                ? 'Tu rutina todavía no tiene ejercicios'
                : 'Todavía no tenés una rutina asignada'}
            </EmptyTitle>
            <EmptyDescription>
              {rutina
                ? 'Tu profesor la está armando — volvé a revisar más tarde.'
                : 'Tu profesor te va a asignar una pronto — volvé a revisar más tarde.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    );
  }

  return (
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-16">
      <PageHeader title={rutina.nombre} right={<LogoutButton />} />

      {rutina.dias.length === 1 ? (
        <ListaEjerciciosDelDia ejercicios={rutina.dias[0].ejercicios} />
      ) : (
        <SelectorDeDias rutinaId={rutina.id} dias={rutina.dias} />
      )}
    </main>
  );
}
