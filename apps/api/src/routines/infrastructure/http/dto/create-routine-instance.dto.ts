import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EjercicioDto } from './ejercicio.dto';

export class CreateRoutineInstanceDto {
  @IsString()
  @MinLength(1)
  alumnoId!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  nombre?: string;

  @IsOptional()
  @IsString()
  origenTemplateId?: string;

  @IsOptional()
  @IsBoolean()
  vincular?: boolean;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => EjercicioDto)
  @ArrayMaxSize(50)
  ejercicios?: EjercicioDto[];
}
