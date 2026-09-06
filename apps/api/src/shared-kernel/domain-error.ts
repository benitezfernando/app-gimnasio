/**
 * Base de todos los errores de dominio de la app — cada bounded context
 * declara los suyos extendiendo esta clase con su propio `httpStatus`.
 * `DomainExceptionFilter` (global, registrado en main.ts) captura
 * cualquier `DomainError` sin necesidad de importar cada clase concreta:
 * un módulo nuevo agrega sus errores sin tocar el filtro.
 *
 * Sin dependencias de framework (ni siquiera el enum `HttpStatus` de
 * Nest) — `httpStatus` es un número plano, la capa de dominio no conoce
 * NestJS.
 */
export abstract class DomainError extends Error {
  abstract readonly httpStatus: number;
}
