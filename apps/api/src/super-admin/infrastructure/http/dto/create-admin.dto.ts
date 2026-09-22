import { IsString, Matches, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateAdminDto {
  @IsString()
  @MinLength(1)
  gymId!: string;

  // Normalizado a minuscula antes de validar -- ver create-profesor.dto.ts.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
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
