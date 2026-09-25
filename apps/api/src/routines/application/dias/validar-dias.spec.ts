import { validarDias } from './validar-dias';
import { EjercicioItem } from '../ports/routine-template-repository.port';
import { TooManyDaysError } from '../errors/too-many-days.error';
import { TooManyExercisesError } from '../errors/too-many-exercises.error';
import { EmptyDayError } from '../errors/empty-day.error';
import { DuplicateExerciseInDayError } from '../errors/duplicate-exercise-in-day.error';

function ej(exerciseId: string, orden = 1): EjercicioItem {
  return { exerciseId, orden, series: 3, repeticiones: 10, peso: null, notas: null };
}

describe('validarDias', () => {
  it('acepta cero días (rutina o plantilla vacía)', () => {
    expect(() => validarDias([])).not.toThrow();
  });

  it('acepta el mismo ejercicio en días distintos', () => {
    expect(() =>
      validarDias([{ ejercicios: [ej('ex-1')] }, { ejercicios: [ej('ex-1')] }]),
    ).not.toThrow();
  });

  it('rechaza 8 días', () => {
    const dias = Array.from({ length: 8 }, (_, i) => ({ ejercicios: [ej(`ex-${i}`)] }));
    expect(() => validarDias(dias)).toThrow(TooManyDaysError);
  });

  it('rechaza 51 ejercicios sumando todos los días', () => {
    const dia = (desde: number, cantidad: number) => ({
      ejercicios: Array.from({ length: cantidad }, (_, i) => ej(`ex-${desde + i}`, i + 1)),
    });
    expect(() => validarDias([dia(0, 25), dia(100, 26)])).toThrow(TooManyExercisesError);
  });

  it('acepta exactamente 50 ejercicios en total', () => {
    const ejercicios = Array.from({ length: 50 }, (_, i) => ej(`ex-${i}`, i + 1));
    expect(() => validarDias([{ ejercicios }])).not.toThrow();
  });

  it('rechaza un día vacío informando su número', () => {
    expect(() => validarDias([{ ejercicios: [ej('ex-1')] }, { ejercicios: [] }])).toThrow(
      'El Día 2 no tiene ejercicios',
    );
    expect(() => validarDias([{ ejercicios: [] }])).toThrow(EmptyDayError);
  });

  it('rechaza un ejercicio repetido dentro del mismo día', () => {
    expect(() => validarDias([{ ejercicios: [ej('ex-1', 1), ej('ex-1', 2)] }])).toThrow(
      DuplicateExerciseInDayError,
    );
  });
});
