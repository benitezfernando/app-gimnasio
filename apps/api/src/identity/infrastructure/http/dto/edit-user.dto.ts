import { IsOptional, IsString, MinLength } from 'class-validator';

export class EditUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
