import { IsString } from 'class-validator';

/** El recorte y el largo (1 a 80) los valida el caso de uso, después de recortar. */
export class SetExerciseAliasDto {
  @IsString()
  nombre!: string;
}
