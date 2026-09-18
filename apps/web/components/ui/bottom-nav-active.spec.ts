import { getActiveNavHref } from './bottom-nav-active';

describe('getActiveNavHref', () => {
  const PROFESOR_HREFS = ['/profesor', '/profesor/plantillas', '/catalogo'];

  it('matchea un pathname exacto', () => {
    expect(getActiveNavHref('/profesor', PROFESOR_HREFS)).toBe('/profesor');
  });

  it('matchea una subruta contra el href padre', () => {
    expect(getActiveNavHref('/profesor/alumnos/abc123', PROFESOR_HREFS)).toBe('/profesor');
  });

  it('prefiere el href mas especifico cuando varios matchean', () => {
    expect(getActiveNavHref('/profesor/plantillas', PROFESOR_HREFS)).toBe('/profesor/plantillas');
    expect(getActiveNavHref('/profesor/plantillas/xyz', PROFESOR_HREFS)).toBe(
      '/profesor/plantillas',
    );
  });

  it('matchea una subruta de catalogo', () => {
    expect(getActiveNavHref('/catalogo/abc', PROFESOR_HREFS)).toBe('/catalogo');
  });

  it('devuelve null si ningun href matchea', () => {
    expect(getActiveNavHref('/login', PROFESOR_HREFS)).toBeNull();
  });
});
