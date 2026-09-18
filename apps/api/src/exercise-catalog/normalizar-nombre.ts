/**
 * Normaliza un nombre de ejercicio para matching de búsqueda
 * accent-insensitive: minúsculas + sin diacríticos (NFD + strip de la
 * franja de marcas combinantes). Nunca se expone en una respuesta de la
 * API — es solo para el WHERE del repositorio (ver
 * `PrismaExerciseRepository.findMany`) y para poblar
 * `Exercise.nombreNormalizado` en el seed.
 */
export function normalizarNombre(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
