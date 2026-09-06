import { IsNotEmpty, IsString } from 'class-validator';

export class AssignProfesorDto {
  @IsString()
  @IsNotEmpty()
  profesorId!: string;
}
