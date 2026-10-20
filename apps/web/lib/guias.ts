/** Un globo de la guía; sin `elemento` se muestra centrado en la pantalla. */
export interface PasoGuia {
  /** Valor del atributo `data-guia` del elemento a resaltar. */
  elemento?: string;
  titulo: string;
  texto: string;
}

export interface Guia {
  id: string;
  pasos: PasoGuia[];
}

/** Subconjunto de `Storage` que se usa (inyectable para testear). */
export interface AlmacenGuias {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

export function claveGuia(userId: string, guiaId: string): string {
  return `guia:${userId}:${guiaId}`;
}

/**
 * Sin almacén usable (servidor, modo privado, cuota llena) se da por vista:
 * es preferible no mostrar la guía que mostrarla en cada visita.
 */
export function guiaVista(almacen: AlmacenGuias | null, clave: string): boolean {
  if (!almacen) return true;
  try {
    return almacen.getItem(clave) !== null;
  } catch {
    return true;
  }
}

export function marcarGuiaVista(almacen: AlmacenGuias | null, clave: string): void {
  try {
    almacen?.setItem(clave, new Date().toISOString());
  } catch {
    // Sin almacén no hay forma de recordarlo; no vale la pena romper la pantalla.
  }
}

/** Descarta los pasos cuyo elemento no existe o no se ve (ej. alumno sin rutina). */
export function pasosVisibles(
  pasos: PasoGuia[],
  estaVisible: (elemento: string) => boolean,
): PasoGuia[] {
  return pasos.filter((paso) => !paso.elemento || estaVisible(paso.elemento));
}

/**
 * Primera guía no vista con al menos un paso visible. Una guía sin pasos
 * visibles se saltea sin marcarse: se mostrará cuando sus elementos existan.
 */
export function siguienteGuia(
  guias: Guia[],
  estaVista: (guiaId: string) => boolean,
  estaVisible: (elemento: string) => boolean,
): Guia | null {
  for (const guia of guias) {
    if (estaVista(guia.id)) continue;
    const pasos = pasosVisibles(guia.pasos, estaVisible);
    if (pasos.length > 0) return { id: guia.id, pasos };
  }
  return null;
}
