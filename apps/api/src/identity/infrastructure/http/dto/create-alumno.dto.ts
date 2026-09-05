import { IsString, MinLength } from 'class-validator';

export class CreateAlumnoDto {
  @IsString()
  @MinLength(2)
  nombre!: string;

  @IsString()
  @MinLength(2)
  apellido!: string;
}
