import { IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  gymId!: string;

  @IsString()
  username!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  password?: string;
}
