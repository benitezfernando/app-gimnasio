import { AuthenticatedUser } from '../domain/authenticated-user';

/**
 * Angosta `AuthenticatedUser.gymId` de `string | null` a `string` en el
 * punto de uso. Solo `SUPER_ADMIN` tiene `gymId: null` (domain/role.ts)
 * y ningún caso de uso gym-scoped es alcanzable por ese rol — el guard
 * de rol de cada endpoint ya lo bloquea antes de llegar acá. Si esto
 * lanza, es un bug de autorización (un guard dejó pasar a alguien que
 * no debía), nunca un estado esperado del negocio — por eso es un Error
 * plano (500 genérico vía el exception filter default de Nest), no un
 * DomainError con su propio código HTTP de negocio.
 */
export function requireGymId(user: AuthenticatedUser): string {
  if (user.gymId === null) {
    throw new Error(
      `Usuario '${user.id}' (rol ${user.role}) sin gymId intentó una operación gym-scoped — bug de autorización, no debería ser alcanzable.`,
    );
  }
  return user.gymId;
}
