import {
  AlmacenGuias,
  Guia,
  claveGuia,
  guiaVista,
  marcarGuiaVista,
  pasosVisibles,
  siguienteGuia,
} from './guias';

function almacenEnMemoria(): AlmacenGuias & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (clave) => datos.get(clave) ?? null,
    setItem: (clave, valor) => {
      datos.set(clave, valor);
    },
  };
}

const almacenQueFalla: AlmacenGuias = {
  getItem: () => {
    throw new Error('localStorage no disponible');
  },
  setItem: () => {
    throw new Error('localStorage no disponible');
  },
};

describe('claveGuia', () => {
  it('combina usuario y guía', () => {
    expect(claveGuia('u-1', 'alumno-rutina')).toBe('guia:u-1:alumno-rutina');
  });
});

describe('guiaVista / marcarGuiaVista', () => {
  it('una guía no marcada no está vista; después de marcarla, sí', () => {
    const almacen = almacenEnMemoria();
    expect(guiaVista(almacen, 'guia:u:x')).toBe(false);
    marcarGuiaVista(almacen, 'guia:u:x');
    expect(guiaVista(almacen, 'guia:u:x')).toBe(true);
  });

  it('si el almacén falla, la da por vista (no se muestra) y marcar no rompe', () => {
    expect(guiaVista(almacenQueFalla, 'guia:u:x')).toBe(true);
    expect(() => marcarGuiaVista(almacenQueFalla, 'guia:u:x')).not.toThrow();
  });

  it('si no hay almacén (servidor), la da por vista', () => {
    expect(guiaVista(null, 'guia:u:x')).toBe(true);
  });
});

describe('pasosVisibles', () => {
  const pasos = [
    { titulo: 'Bienvenida', texto: 'centrado' },
    { elemento: 'existe', titulo: 'A', texto: 'a' },
    { elemento: 'no-existe', titulo: 'B', texto: 'b' },
  ];

  it('conserva los centrados y los que tienen elemento visible', () => {
    const visibles = pasosVisibles(pasos, (nombre) => nombre === 'existe');
    expect(visibles.map((p) => p.titulo)).toEqual(['Bienvenida', 'A']);
  });
});

describe('siguienteGuia', () => {
  const guias: Guia[] = [
    { id: 'vista', pasos: [{ titulo: 'x', texto: 'x' }] },
    { id: 'sin-pasos-visibles', pasos: [{ elemento: 'no-existe', titulo: 'y', texto: 'y' }] },
    { id: 'pendiente', pasos: [{ elemento: 'existe', titulo: 'z', texto: 'z' }] },
  ];
  const existe = (nombre: string) => nombre === 'existe';

  it('saltea las vistas y las que no tienen pasos visibles', () => {
    const resultado = siguienteGuia(guias, (id) => id === 'vista', existe);
    expect(resultado?.id).toBe('pendiente');
    expect(resultado?.pasos.map((p) => p.titulo)).toEqual(['z']);
  });

  it('devuelve null si no queda ninguna', () => {
    expect(siguienteGuia(guias, (id) => id !== 'sin-pasos-visibles', existe)).toBeNull();
  });
});
