import Link from 'next/link';
import Image from 'next/image';
import { Dumbbell } from 'lucide-react';
import { apiFetch, ApiError } from '../../../lib/api-client';
import { PageHeader } from '../../../components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { GradientIcon } from '../../../components/ui/gradient-icon';
import { LogoutButton } from '../../../components/logout-button';

interface RutinaVigenteResponse {
  id: string;
  nombre: string;
  ejercicios: Array<{
    exerciseId: string;
    nombre: string;
    imageUrl: string | null;
    orden: number;
    series: number;
    repeticiones: number;
    peso: number | null;
  }>;
}

export default async function AlumnoPage() {
  let rutina: RutinaVigenteResponse | null = null;
  try {
    rutina = await apiFetch<RutinaVigenteResponse>('/users/me/rutina-vigente');
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    rutina = null;
  }

  if (!rutina) {
    return (
      <main className="flex w-full flex-col items-center gap-2 px-8 pb-28 pt-8 text-center sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-16">
        <PageHeader title="Rutina" right={<LogoutButton />} />
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Dumbbell />
            </EmptyMedia>
            <EmptyTitle>Todavía no tenés una rutina asignada</EmptyTitle>
            <EmptyDescription>
              Tu profesor te va a asignar una pronto — volvé a revisar más tarde.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    );
  }

  return (
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-16">
      <PageHeader title={rutina.nombre} right={<LogoutButton />} />

      <ul className="flex flex-col gap-3">
        {rutina.ejercicios
          .sort((a, b) => a.orden - b.orden)
          .map((ejercicio) => (
            <li key={ejercicio.exerciseId}>
              <Link
                href={`/catalogo/${ejercicio.exerciseId}`}
                className="block rounded-2xl focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="flex flex-row items-center gap-3 p-4 lg:p-3">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-background">
                    {ejercicio.imageUrl ? (
                      <Image
                        src={ejercicio.imageUrl}
                        alt={ejercicio.nombre}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <GradientIcon icon={Dumbbell} size={20} />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <p className="text-sm font-medium text-foreground">{ejercicio.nombre}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline">{ejercicio.series} series</Badge>
                      <Badge variant="outline">{ejercicio.repeticiones} reps</Badge>
                      {ejercicio.peso !== null && (
                        <Badge variant="outline">{ejercicio.peso}kg</Badge>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
      </ul>
    </main>
  );
}
