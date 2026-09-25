import {
  DiaPlantillaReferencia,
  EjercicioItem,
  RoutineTemplateRepositoryPort,
} from '../ports/routine-template-repository.port';
import { resolverVinculoDeDia } from './resolver-vinculo-de-dia';

export interface DiaConPedidoDeVinculo {
  vinculadoADiaId?: string;
  anterior: string | null;
  ejercicios: EjercicioItem[];
}

/** Un solo `findDiasByIds` para todos los días pedidos, y la regla de vínculo aplicada a cada uno. */
export async function resolverVinculosPedidos(
  templateRepository: RoutineTemplateRepositoryPort,
  invocadoPor: { id: string; gymId: string },
  dias: DiaConPedidoDeVinculo[],
): Promise<{ vinculos: Array<string | null>; referencias: Map<string, DiaPlantillaReferencia> }> {
  const pedidos = [...new Set(dias.flatMap((d) => (d.vinculadoADiaId ? [d.vinculadoADiaId] : [])))];
  const referencias = new Map(
    (await templateRepository.findDiasByIds(pedidos)).map((r) => [r.id, r]),
  );

  const vinculos = dias.map((dia) => {
    const referencia = dia.vinculadoADiaId ? referencias.get(dia.vinculadoADiaId) : undefined;
    return resolverVinculoDeDia({
      pedido: dia.vinculadoADiaId,
      anterior: dia.anterior,
      exerciseIdsDelDia: dia.ejercicios.map((e) => e.exerciseId),
      diaPlantilla: referencia && {
        id: referencia.id,
        exerciseIds: referencia.exerciseIds,
        esDelInvocador:
          referencia.profesorId === invocadoPor.id && referencia.gymId === invocadoPor.gymId,
      },
    });
  });

  return { vinculos, referencias };
}
