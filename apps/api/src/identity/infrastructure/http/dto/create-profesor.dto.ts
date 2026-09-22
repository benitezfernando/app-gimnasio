import { IsString, Matches, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateProfesorDto {
  // Charset restringido a propósito: `synthetic-credentials.ts` arma el
  // email sintético y el input del HMAC concatenando gymId+username con
  // `@`/`+`/`:` como separadores — un username que contenga esos
  // caracteres podría romper esa estructura o, en el caso de `:`, generar
  // ambigüedad en el input del HMAC. Los usernames autogenerados de
  // alumno ya cumplen esto por construcción; este es el único punto de
  // entrada donde el username lo escribe un cliente.
  //
  // Se normaliza a minúscula antes de validar (@Transform corre antes que
  // @Matches con `transform: true` en el ValidationPipe global) — un admin
  // tipeando "Juan.Perez" no debería chocar contra el regex ni terminar
  // con un username distinto al que despues necesita para loguearse.
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
