import { IsString, MinLength } from 'class-validator';

export class SuperAdminLoginDto {
  @IsString()
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
