import { normalizarNombre } from './normalizar-nombre';

describe('normalizarNombre', () => {
  it('pasa a minúsculas', () => {
    expect(normalizarNombre('Sentadilla')).toBe('sentadilla');
  });

  it('saca acentos agudos', () => {
    expect(normalizarNombre('Press Francés')).toBe('press frances');
  });

  it('saca acentos de todas las vocales', () => {
    expect(normalizarNombre('áéíóú')).toBe('aeiou');
  });

  it('no rompe con texto que ya no tiene acentos', () => {
    expect(normalizarNombre('bench press')).toBe('bench press');
  });

  it('no toca dígitos ni símbolos', () => {
    expect(normalizarNombre('3/4 Sit-Up')).toBe('3/4 sit-up');
  });
});
