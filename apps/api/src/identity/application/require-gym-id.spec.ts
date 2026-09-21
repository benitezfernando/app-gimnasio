import { Role } from '../domain/role';
import { requireGymId } from './require-gym-id';

describe('requireGymId', () => {
  it('devuelve el gymId cuando existe', () => {
    expect(requireGymId({ id: 'u1', gymId: 'gym-1', role: Role.ADMIN })).toBe('gym-1');
  });

  it('lanza si el usuario no tiene gymId (SUPER_ADMIN)', () => {
    expect(() => requireGymId({ id: 'u1', gymId: null, role: Role.SUPER_ADMIN })).toThrow();
  });
});
