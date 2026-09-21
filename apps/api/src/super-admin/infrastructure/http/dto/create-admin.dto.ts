import { IsString, Matches, MinLength } from 'class-validator';

export class CreateAdminDto {
  @IsString()
  @MinLength(1)
  gymId!: string;

  @IsString()
  @MinLength(3)
  @Matches(/^[a-z0-9._-]+$/, {
    message: 'username solo puede tener minúsculas, números, puntos, guiones y guiones bajos',
  })
  username!: string;

  @IsString()
  @MinLength(2)
  nombre!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
