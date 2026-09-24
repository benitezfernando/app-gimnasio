import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { DiaInstanciaDto } from './dia.dto';

export class ReplaceInstanceDaysDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiaInstanciaDto)
  @ArrayMaxSize(7)
  dias!: DiaInstanciaDto[];
}
