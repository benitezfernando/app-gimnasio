import { GymId } from './gym-id.value-object';

describe('GymId', () => {
  it('crea un GymId válido a partir de un string no vacío', () => {
    const gymId = GymId.create('gym-123');
    expect(gymId.value).toBe('gym-123');
  });

  it('rechaza un valor vacío', () => {
    expect(() => GymId.create('')).toThrow('GymId no puede estar vacío');
  });

  it('dos GymId con el mismo valor son iguales', () => {
    const a = GymId.create('gym-123');
    const b = GymId.create('gym-123');
    expect(a.equals(b)).toBe(true);
  });
});
