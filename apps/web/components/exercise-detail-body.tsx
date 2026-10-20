import Image from 'next/image';
import { Dumbbell } from 'lucide-react';
import { ETIQUETA_PARTE_CUERPO } from '../lib/region-colors';
import { ETIQUETA_GRUPO_MUSCULAR } from '../lib/muscle-group-options';
import { ETIQUETA_EQUIPAMIENTO } from '../lib/equipment-options';
import { Badge } from '@/components/ui/badge';

export interface ExerciseDetail {
  id: string;
  nombre: string;
  nombreOriginal: string | null;
  imageUrl: string | null;
  gifUrl: string | null;
  parteCuerpo: string;
  grupoMuscular: string;
  gruposMuscularesSecundarios: string[];
  equipamiento: string | null;
  instrucciones: string | null;
  pasos: string[];
  atribucionMedia: string | null;
}

/**
 * GIF, etiquetas, pasos y atribución de un ejercicio. Sin hooks: lo usan
 * la página `/catalogo/[id]` (servidor) y el diálogo del editor (cliente).
 */
export function ExerciseDetailBody({ ejercicio }: { ejercicio: ExerciseDetail }) {
  return (
    <>
      {/*
        La media del catálogo mide 180×180 px: estirada al ancho de la
        columna (~640 px, 3,6×) se ve borrosa. Tope en 360 px = 2× el
        original, el máximo que todavía se ve nítido. En celular, 75% del
        ancho (~1,4× en un teléfono de 375 px) para ganar nitidez.
      */}
      <div className="relative mx-auto aspect-square w-3/4 max-w-[360px] self-center overflow-hidden rounded-xl bg-card sm:w-full">
        {ejercicio.gifUrl || ejercicio.imageUrl ? (
          <Image
            src={ejercicio.gifUrl ?? ejercicio.imageUrl!}
            alt={ejercicio.nombre}
            fill
            unoptimized
            sizes="(max-width: 640px) 75vw, 360px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Dumbbell className="text-muted-foreground" size={64} aria-hidden />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">
          {ETIQUETA_PARTE_CUERPO[ejercicio.parteCuerpo] ?? ejercicio.parteCuerpo}
        </Badge>
        <Badge variant="outline">
          {ETIQUETA_GRUPO_MUSCULAR[ejercicio.grupoMuscular] ?? ejercicio.grupoMuscular}
        </Badge>
        {ejercicio.equipamiento && (
          <Badge variant="outline">
            {ETIQUETA_EQUIPAMIENTO[ejercicio.equipamiento] ?? ejercicio.equipamiento}
          </Badge>
        )}
        {ejercicio.gruposMuscularesSecundarios.map((g) => (
          <Badge variant="outline" key={g}>
            {ETIQUETA_GRUPO_MUSCULAR[g] ?? g}
          </Badge>
        ))}
      </div>

      {ejercicio.pasos.length > 0 ? (
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-foreground">
          {ejercicio.pasos.map((paso, indice) => (
            <li key={indice}>{paso}</li>
          ))}
        </ol>
      ) : (
        ejercicio.instrucciones && (
          <p className="text-sm text-foreground">{ejercicio.instrucciones}</p>
        )
      )}

      {ejercicio.atribucionMedia && (
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          {ejercicio.atribucionMedia}
        </p>
      )}
    </>
  );
}
