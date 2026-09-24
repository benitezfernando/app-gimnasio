import { RoutineTemplateNotFoundError } from '../errors/routine-template-not-found.error';

export interface DiaPlantillaReferenciado {
  id: string;
  exerciseIds: string[];
  /** Pertenece a una plantilla del profesor que invoca, en su mismo gym. */
  esDelInvocador: boolean;
}

export interface EntradaVinculo {
  pedido: string | undefined;
  /** Vínculo que el día ya tenía persistido; `null` para días nuevos. */
  anterior: string | null;
  exerciseIdsDelDia: string[];
  diaPlantilla: DiaPlantillaReferenciado | undefined;
}

/**
 * Regla única de vínculo (spec §Regla única de vínculo). Un vínculo que
 * el día ya tenía no exige propiedad: otro profesor de la cartera puede
 * haberlo vinculado a SU plantilla y se conserva mientras el conjunto de
 * ejercicios no cambie.
 */
export function resolverVinculoDeDia(entrada: EntradaVinculo): string | null {
  const { pedido, anterior, exerciseIdsDelDia, diaPlantilla } = entrada;
  if (!pedido) {
    return null;
  }

  const esVinculoNuevo = pedido !== anterior;
  if (esVinculoNuevo && (!diaPlantilla || !diaPlantilla.esDelInvocador)) {
    throw new RoutineTemplateNotFoundError(pedido);
  }
  if (!diaPlantilla) {
    return null;
  }

  return mismoConjunto(exerciseIdsDelDia, diaPlantilla.exerciseIds) ? pedido : null;
}

function mismoConjunto(a: string[], b: string[]): boolean {
  const conjuntoA = new Set(a);
  const conjuntoB = new Set(b);
  if (conjuntoA.size !== conjuntoB.size) return false;
  return [...conjuntoA].every((id) => conjuntoB.has(id));
}
