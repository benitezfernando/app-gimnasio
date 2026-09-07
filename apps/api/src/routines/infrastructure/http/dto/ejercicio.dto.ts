import { IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class EjercicioDto {
  @IsString()
  @MinLength(1)
  exerciseId!: string;

  @IsInt()
  @Min(1)
  orden!: number;

  @IsInt()
  @Min(1)
  series!: number;

  @IsInt()
  @Min(1)
  repeticiones!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999.99)
  peso?: number;

  @IsInt()
  @Min(0)
  descanso!: number;

  @IsOptional()
  @IsString()
  notas?: string;
}
