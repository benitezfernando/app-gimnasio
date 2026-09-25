import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { DiaPlantillaDto } from './dia.dto';

export class ReplaceTemplateDaysDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiaPlantillaDto)
  @ArrayMaxSize(7)
  dias!: DiaPlantillaDto[];
}
