import { mergeEjerciciosVinculados } from './merge-ejercicios-vinculados';
import { EjercicioItem } from './ports/routine-template-repository.port';

describe('mergeEjerciciosVinculados', () => {
  it('un ejercicio que el alumno ya tenía conserva series/repeticiones/peso propios', () => {
    const deTemplate: EjercicioItem[] = [
      {
        exerciseId: 'ex-1',
        orden: 1,
        series: 4,
        repeticiones: 12,
        peso: 50,
        notas: 'de la plantilla',
      },
    ];
    const delAlumno: EjercicioItem[] = [
      { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, peso: 20, notas: null },
    ];

    const resultado = mergeEjerciciosVinculados(deTemplate, delAlumno);

    expect(resultado).toEqual([
      {
        exerciseId: 'ex-1',
        orden: 1,
        series: 3,
        repeticiones: 10,
        peso: 20,
        notas: 'de la plantilla',
      },
    ]);
  });

  it('un ejercicio nuevo que la plantilla agregó arranca con los valores de la plantilla', () => {
    const deTemplate: EjercicioItem[] = [
      { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, peso: 20, notas: null },
      { exerciseId: 'ex-2', orden: 2, series: 4, repeticiones: 8, peso: 30, notas: 'nuevo' },
    ];
    const delAlumno: EjercicioItem[] = [
      { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, peso: 20, notas: null },
    ];

    const resultado = mergeEjerciciosVinculados(deTemplate, delAlumno);

    expect(resultado[1]).toEqual({
      exerciseId: 'ex-2',
      orden: 2,
      series: 4,
      repeticiones: 8,
      peso: 30,
      notas: 'nuevo',
    });
  });

  it('un ejercicio que la plantilla sacó desaparece del resultado', () => {
    const deTemplate: EjercicioItem[] = [
      { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, peso: 20, notas: null },
    ];
    const delAlumno: EjercicioItem[] = [
      { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, peso: 20, notas: null },
      { exerciseId: 'ex-viejo', orden: 2, series: 3, repeticiones: 10, peso: null, notas: null },
    ];

    const resultado = mergeEjerciciosVinculados(deTemplate, delAlumno);

    expect(resultado.map((e) => e.exerciseId)).toEqual(['ex-1']);
  });

  it('el orden final sigue el orden de la plantilla', () => {
    const deTemplate: EjercicioItem[] = [
      { exerciseId: 'ex-2', orden: 1, series: 4, repeticiones: 8, peso: null, notas: null },
      { exerciseId: 'ex-1', orden: 2, series: 4, repeticiones: 8, peso: null, notas: null },
    ];
    const delAlumno: EjercicioItem[] = [
      { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, peso: 20, notas: null },
      { exerciseId: 'ex-2', orden: 2, series: 3, repeticiones: 10, peso: 20, notas: null },
    ];

    const resultado = mergeEjerciciosVinculados(deTemplate, delAlumno);

    expect(resultado.map((e) => ({ exerciseId: e.exerciseId, orden: e.orden }))).toEqual([
      { exerciseId: 'ex-2', orden: 1 },
      { exerciseId: 'ex-1', orden: 2 },
    ]);
  });
});
