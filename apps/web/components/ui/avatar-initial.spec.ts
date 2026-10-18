import { inicialDe } from './avatar-initial';

describe('inicialDe', () => {
  it('devuelve la primera letra en mayúscula', () => {
    expect(inicialDe('Fernando Benitez')).toBe('F');
  });

  it('funciona con un solo nombre', () => {
    expect(inicialDe('fernando')).toBe('F');
  });

  it('devuelve "?" si el nombre está vacío', () => {
    expect(inicialDe('')).toBe('?');
  });
});
