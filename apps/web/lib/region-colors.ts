/**
 * Las 10 regiones (`body_part` del dataset) son un universo cerrado y
 * conocido de antemano — se hardcodean acá en vez de pedirle al backend
 * los valores distintos (no hace falta un round-trip para una lista que
 * no cambia). Mapeadas a un slug sin espacios porque los nombres de CSS
 * custom properties no pueden tener espacios.
 */
const REGION_A_SLUG: Record<string, string> = {
  chest: 'chest',
  back: 'back',
  shoulders: 'shoulders',
  'upper arms': 'upper-arms',
  'lower arms': 'lower-arms',
  waist: 'waist',
  'upper legs': 'upper-legs',
  'lower legs': 'lower-legs',
  cardio: 'cardio',
  neck: 'neck',
};

export const PARTES_CUERPO = Object.keys(REGION_A_SLUG);

export function regionColorVar(parteCuerpo: string): string {
  const slug = REGION_A_SLUG[parteCuerpo] ?? 'waist';
  return `rgb(var(--color-region-${slug}) / 1)`;
}
