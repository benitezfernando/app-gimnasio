import { IsString, MinLength } from 'class-validator';

export class UpdateRoutineInstanceDto {
  @IsString()
  @MinLength(2)
  nombre!: string;
}
