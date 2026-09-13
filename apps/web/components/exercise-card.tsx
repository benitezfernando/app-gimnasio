import Image from 'next/image';
import { Dumbbell } from 'lucide-react';
import { ETIQUETA_PARTE_CUERPO, regionColorVar } from '../lib/region-colors';
import { ETIQUETA_EQUIPAMIENTO } from '../lib/equipment-options';
import { Card } from './ui/card';
import { Pill } from './ui/pill';
import { GradientIcon } from './ui/gradient-icon';

export interface ExerciseCardData {
  id: string;
  nombre: string;
  imageUrl: string | null;
  parteCuerpo: string;
  equipamiento: string | null;
}

/**
 * La imagen es el elemento visual central de la card (HU-09 / pedido
 * explícito) — nunca un espacio roto: si imageUrl viene null, ícono
 * genérico de fallback. Sin GIF acá a propósito (ver Global Constraints
 * del plan) — el GIF es exclusivo del detalle.
 */
export function ExerciseCard({ ejercicio }: { ejercicio: ExerciseCardData }) {
  return (
    <Card className="flex flex-col gap-3 overflow-visible p-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-full bg-surface">
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
        <span
          className="absolute left-1 top-1 rounded-full px-2 py-1 text-xs font-medium text-white"
          style={{ backgroundColor: regionColorVar(ejercicio.parteCuerpo) }}
        >
          {ETIQUETA_PARTE_CUERPO[ejercicio.parteCuerpo] ?? ejercicio.parteCuerpo}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="line-clamp-2 text-sm font-medium text-text">{ejercicio.nombre}</h3>
        {ejercicio.equipamiento && (
          <Pill className="self-start">
            {ETIQUETA_EQUIPAMIENTO[ejercicio.equipamiento] ?? ejercicio.equipamiento}
          </Pill>
        )}
      </div>
    </Card>
  );
}
