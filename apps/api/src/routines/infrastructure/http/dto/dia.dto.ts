import { Type } from 'class-transformer';
import { ArrayMaxSize, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { EjercicioDto } from './ejercicio.dto';

/** El mínimo de 1 ejercicio por día y el total de 50 los valida `validarDias` en el caso de uso. */
export class DiaPlantillaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  id?: string;

  @ValidateNested({ each: true })
  @Type(() => EjercicioDto)
  @ArrayMaxSize(50)
  ejercicios!: EjercicioDto[];
}

export class DiaInstanciaDto extends DiaPlantillaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  vinculadoADiaId?: string;
}

/** Días de una rutina nueva: nunca traen `id`. */
export class DiaNuevoDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  vinculadoADiaId?: string;

  @ValidateNested({ each: true })
  @Type(() => EjercicioDto)
  @ArrayMaxSize(50)
  ejercicios!: EjercicioDto[];
}
