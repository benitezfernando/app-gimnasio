import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsString } from 'class-validator';

// Tope 50 — mismo límite que ejercicios.length <= 50 en RoutineTemplate/
// RoutineInstance (ver docs/superpowers/specs/2026-09-06-routines-hard-delete-design.md).
// No hay ningún caso de uso legítimo que necesite pedir más de 50 de una.
const MAX_IDS = 50;

export class GetExercisesByIdsDto {
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : value,
  )
  @IsString({ each: true })
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_IDS)
  ids!: string[];
}
