/**
 * Elige, de una lista de hrefs de items de navegación, cuál corresponde a
 * la pestaña activa para un pathname dado. Un href matchea si es igual al
 * pathname o si el pathname es una subruta suya (`${href}/...`). Cuando
 * más de un href matchea (ej. "/profesor" y "/profesor/plantillas" ambos
 * matchean "/profesor/plantillas/abc"), gana el más específico (el más
 * largo) — así una subruta de Plantillas no enciende también Cartera.
 */
export function getActiveNavHref(pathname: string, hrefs: string[]): string | null {
  let mejor: string | null = null;
  for (const href of hrefs) {
    const matchea = pathname === href || pathname.startsWith(`${href}/`);
    if (matchea && (mejor === null || href.length > mejor.length)) {
      mejor = href;
    }
  }
  return mejor;
}
