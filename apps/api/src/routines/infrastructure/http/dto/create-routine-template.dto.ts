import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateRoutineTemplateDto {
  @IsString()
  @MinLength(2)
  nombre!: string;

  @IsOptional()
  @IsString()
  descripcion?: string;
}
