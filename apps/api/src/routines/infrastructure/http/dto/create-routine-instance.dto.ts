import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DiaNuevoDto } from './dia.dto';

export class CreateRoutineInstanceDto {
  @IsString()
  @MinLength(1)
  alumnoId!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  nombre?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiaNuevoDto)
  @ArrayMaxSize(7)
  dias!: DiaNuevoDto[];
}
