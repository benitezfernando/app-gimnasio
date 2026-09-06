import Image from 'next/image';
import { Dumbbell } from 'lucide-react';
import { regionColorVar } from '../lib/region-colors';

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
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <div className="relative aspect-square w-full bg-surface-alt">
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
            <Dumbbell className="text-text-muted" size={40} aria-hidden />
          </div>
        )}
        <span
          className="absolute left-2 top-2 rounded-full px-2 py-1 text-xs font-medium capitalize text-white"
          style={{ backgroundColor: regionColorVar(ejercicio.parteCuerpo) }}
        >
          {ejercicio.parteCuerpo}
        </span>
      </div>
      <div className="flex flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-medium text-text">{ejercicio.nombre}</h3>
        {ejercicio.equipamiento && (
          <p className="text-xs capitalize text-text-muted">{ejercicio.equipamiento}</p>
        )}
      </div>
    </div>
  );
}
