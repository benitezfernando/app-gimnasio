import Image from 'next/image';
import { Dumbbell } from 'lucide-react';
import { ETIQUETA_PARTE_CUERPO, regionColorVar } from '../lib/region-colors';
import { ETIQUETA_EQUIPAMIENTO } from '../lib/equipment-options';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GradientIcon } from './ui/gradient-icon';

export interface ExerciseCardData {
  id: string;
  nombre: string;
  nombreOriginal: string | null;
  imageUrl: string | null;
  parteCuerpo: string;
  equipamiento: string | null;
}

/**
 * "Nombre (Original)" para que alguien que busca por el nombre en
 * inglés del dataset original pueda reconocer el ejercicio — solo si
 * difiere del nombre en español (muchos ya coinciden o el original no
 * aporta nada distinto).
 */
export function nombreConOriginal(nombre: string, nombreOriginal: string | null): string {
  if (!nombreOriginal) return nombre;
  if (nombreOriginal.trim().toLowerCase() === nombre.trim().toLowerCase()) return nombre;
  return `${nombre} (${nombreOriginal})`;
}

/**
 * La imagen es el elemento visual central de la card (HU-09 / pedido
 * explícito) — nunca un espacio roto: si imageUrl viene null, ícono
 * genérico de fallback. Sin GIF acá a propósito (ver Global Constraints
 * del plan) — el GIF es exclusivo del detalle.
 */
export function ExerciseCard({ ejercicio }: { ejercicio: ExerciseCardData }) {
  return (
    <Card className="flex flex-col gap-3 p-4 lg:p-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-full bg-background">
        {ejercicio.imageUrl ? (
          <Image
            src={ejercicio.imageUrl}
            alt={ejercicio.nombre}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <GradientIcon icon={Dumbbell} size={32} />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="line-clamp-2 text-sm font-medium text-foreground">
          {nombreConOriginal(ejercicio.nombre, ejercicio.nombreOriginal)}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          <Badge
            className="border-transparent text-white"
            style={{ backgroundColor: regionColorVar(ejercicio.parteCuerpo) }}
          >
            {ETIQUETA_PARTE_CUERPO[ejercicio.parteCuerpo] ?? ejercicio.parteCuerpo}
          </Badge>
          {ejercicio.equipamiento && (
            <Badge variant="outline">
              {ETIQUETA_EQUIPAMIENTO[ejercicio.equipamiento] ?? ejercicio.equipamiento}
            </Badge>
          )}
        </div>
      </div>
    </Card>
  );
}
