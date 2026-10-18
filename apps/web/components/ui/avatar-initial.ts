export function inicialDe(nombre: string): string {
  const primera = nombre.trim().charAt(0);
  return primera ? primera.toUpperCase() : '?';
}
