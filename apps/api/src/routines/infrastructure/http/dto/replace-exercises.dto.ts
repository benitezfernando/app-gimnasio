import { Type } from 'class-transformer';
import { ArrayMaxSize, ValidateNested } from 'class-validator';
import { EjercicioDto } from './ejercicio.dto';

export class ReplaceExercisesDto {
  @ValidateNested({ each: true })
  @Type(() => EjercicioDto)
  @ArrayMaxSize(50)
  ejercicios!: EjercicioDto[];
}
