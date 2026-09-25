import { mergeDiaVinculado } from './merge-dia-vinculado';
import { EjercicioItem } from '../ports/routine-template-repository.port';

function ej(exerciseId: string, valores: Partial<EjercicioItem> = {}): EjercicioItem {
  return {
    exerciseId,
    orden: 1,
    series: 4,
    repeticiones: 12,
    peso: 50,
    notas: null,
    ...valores,
  };
}

describe('mergeDiaVinculado', () => {
  it('estructura, orden y notas salen de la plantilla', () => {
    const resultado = mergeDiaVinculado({
      ejerciciosDiaPlantilla: [
        ej('ex-2', { orden: 1, notas: 'nota nueva' }),
        ej('ex-1', { orden: 2 }),
      ],
      ejerciciosDiaInstancia: [ej('ex-1', { orden: 1, series: 3 }), ej('ex-3', { orden: 2 })],
      ejerciciosOtrosDiasVinculados: [],
    });

    expect(resultado.map((e) => [e.exerciseId, e.orden, e.notas])).toEqual([
      ['ex-2', 1, 'nota nueva'],
      ['ex-1', 2, null],
    ]);
  });

  it('prioridad 1: series/reps/peso del alumno en el mismo día', () => {
    const [resultado] = mergeDiaVinculado({
      ejerciciosDiaPlantilla: [ej('ex-1')],
      ejerciciosDiaInstancia: [ej('ex-1', { series: 3, repeticiones: 8, peso: 20 })],
      ejerciciosOtrosDiasVinculados: [[ej('ex-1', { series: 9, repeticiones: 9, peso: 99 })]],
    });

    expect([resultado.series, resultado.repeticiones, resultado.peso]).toEqual([3, 8, 20]);
  });

  it('prioridad 2: el ejercicio cambió de día en la plantilla y aparece una sola vez en otro día vinculado', () => {
    const [resultado] = mergeDiaVinculado({
      ejerciciosDiaPlantilla: [ej('ex-1')],
      ejerciciosDiaInstancia: [],
      ejerciciosOtrosDiasVinculados: [[ej('ex-1', { series: 5, repeticiones: 6, peso: 70 })]],
    });

    expect([resultado.series, resultado.repeticiones, resultado.peso]).toEqual([5, 6, 70]);
  });

  it('prioridad 3: ambigüedad (aparece en dos otros días) → valores de la plantilla', () => {
    const [resultado] = mergeDiaVinculado({
      ejerciciosDiaPlantilla: [ej('ex-1', { series: 4, repeticiones: 12, peso: 50 })],
      ejerciciosDiaInstancia: [],
      ejerciciosOtrosDiasVinculados: [
        [ej('ex-1', { series: 5, peso: 70 })],
        [ej('ex-1', { series: 6, peso: 80 })],
      ],
    });

    expect([resultado.series, resultado.repeticiones, resultado.peso]).toEqual([4, 12, 50]);
  });

  it('prioridad 3: ejercicio nuevo en la plantilla → valores de la plantilla', () => {
    const [resultado] = mergeDiaVinculado({
      ejerciciosDiaPlantilla: [ej('ex-7', { series: 2, repeticiones: 20, peso: null })],
      ejerciciosDiaInstancia: [ej('ex-1')],
      ejerciciosOtrosDiasVinculados: [],
    });

    expect(resultado).toEqual(ej('ex-7', { series: 2, repeticiones: 20, peso: null }));
  });
});
