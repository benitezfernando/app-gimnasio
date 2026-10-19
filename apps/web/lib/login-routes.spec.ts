import { loginDeRol, loginPorSesionVencida } from './login-routes';

describe('loginDeRol', () => {
  it.each([
    ['ALUMNO', '/alumno/login'],
    ['PROFESOR', '/login'],
    ['ADMIN', '/login'],
    ['SUPER_ADMIN', '/super-admin/login'],
  ] as const)('%s → %s', (rol, destino) => {
    expect(loginDeRol(rol)).toBe(destino);
  });
});

describe('loginPorSesionVencida', () => {
  it.each([
    ['/profesor/alumnos/1', '/login?sessionExpired=1'],
    ['/admin', '/login?sessionExpired=1'],
    ['/super-admin', '/super-admin/login'],
    ['/alumno', '/alumno/login?sessionExpired=1'],
    ['/catalogo/x', '/alumno/login?sessionExpired=1'],
    ['/', '/alumno/login?sessionExpired=1'],
  ])('%s → %s', (ruta, destino) => {
    expect(loginPorSesionVencida(ruta)).toBe(destino);
  });

  it('no confunde /administracion con /admin', () => {
    expect(loginPorSesionVencida('/administracion')).toBe('/alumno/login?sessionExpired=1');
  });
});
