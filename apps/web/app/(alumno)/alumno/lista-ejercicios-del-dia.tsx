'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Dumbbell } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GradientIcon } from '../../../components/ui/gradient-icon';
import { ExerciseDetailDialog } from '../../../components/exercise-detail-dialog';

export interface EjercicioDeRutina {
  exerciseId: string;
  nombre: string;
  imageUrl: string | null;
  orden: number;
  series: number;
  repeticiones: number;
  peso: number | null;
}

export function ListaEjerciciosDelDia({ ejercicios }: { ejercicios: EjercicioDeRutina[] }) {
  const [viendoDetalle, setViendoDetalle] = useState<EjercicioDeRutina | null>(null);

  return (
    <>
      <ul className="flex flex-col gap-3">
        {[...ejercicios]
          .sort((a, b) => a.orden - b.orden)
          .map((ejercicio) => (
            <li key={ejercicio.exerciseId}>
              <button
                type="button"
                onClick={() => setViendoDetalle(ejercicio)}
                aria-label={`Ver detalle de ${ejercicio.nombre}`}
                data-guia="ejercicio-rutina"
                className="block w-full rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="flex flex-row items-center gap-3 p-4 lg:p-3">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-background">
                    {ejercicio.imageUrl ? (
                      <Image
                        src={ejercicio.imageUrl}
                        unoptimized
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
              </button>
            </li>
          ))}
      </ul>

      {viendoDetalle && (
        <ExerciseDetailDialog
          key={viendoDetalle.exerciseId}
          exerciseId={viendoDetalle.exerciseId}
          nombre={viendoDetalle.nombre}
          onCerrar={() => setViendoDetalle(null)}
        />
      )}
    </>
  );
}
