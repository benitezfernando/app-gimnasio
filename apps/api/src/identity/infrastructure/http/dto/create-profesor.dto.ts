import { IsString, Matches, MinLength } from 'class-validator';

export class CreateProfesorDto {
  // Charset restringido a propósito: `synthetic-credentials.ts` arma el
  // email sintético y el input del HMAC concatenando gymId+username con
  // `@`/`+`/`:` como separadores — un username que contenga esos
  // caracteres podría romper esa estructura o, en el caso de `:`, generar
  // ambigüedad en el input del HMAC. Los usernames autogenerados de
  // alumno ya cumplen esto por construcción; este es el único punto de
  // entrada donde el username lo escribe un cliente.
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
