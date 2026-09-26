import { nombreConOriginal } from './exercise-card';

describe('nombreConOriginal', () => {
  it('agrega el original entre paréntesis cuando difiere del nombre en español', () => {
    expect(nombreConOriginal('3/4 abdominal', '3/4 sit-up')).toBe('3/4 abdominal (3/4 sit-up)');
  });

  it('devuelve solo el nombre si no hay nombreOriginal', () => {
    expect(nombreConOriginal('3/4 abdominal', null)).toBe('3/4 abdominal');
  });

  it('devuelve solo el nombre si el original es igual (sin distinguir mayúsculas/espacios)', () => {
    expect(nombreConOriginal('Plancha', '  plancha  ')).toBe('Plancha');
  });
});
