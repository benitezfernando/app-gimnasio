import {
  mapExerciseFields,
  validarDatasetExercise,
  DatasetExercise,
  LICENCIA_MEDIA,
} from './dataset-mapper';

const itemCompleto: DatasetExercise = {
  id: '0001',
  name: '3/4 sit-up',
  body_part: 'waist',
  target: 'abs',
  secondary_muscles: ['hip flexors', 'lower back'],
  equipment: 'body weight',
  image: 'images/0001-2gPfomN.jpg',
  gif_url: 'videos/0001-2gPfomN.gif',
  instructions: { es: 'Instrucción en español.', en: 'English instruction.' },
  instruction_steps: { es: ['Paso 1', 'Paso 2'], en: ['Step 1', 'Step 2'] },
  attribution: '© Gym visual — https://gymvisual.com/',
};

describe('mapExerciseFields', () => {
  it('mapea todos los campos desde el item completo del dataset', () => {
    const resolver = jest.fn((ruta: string | null) =>
      ruta ? `https://cdn.example.com/${ruta}` : null,
    );

    const resultado = mapExerciseFields(itemCompleto, resolver);

    expect(resultado).toEqual({
      nombre: '3/4 sit-up',
      parteCuerpo: 'waist',
      grupoMuscular: 'abs',
      gruposMuscularesSecundarios: ['hip flexors', 'lower back'],
      equipamiento: 'body weight',
      imageUrl: 'https://cdn.example.com/images/0001-2gPfomN.jpg',
      gifUrl: 'https://cdn.example.com/videos/0001-2gPfomN.gif',
      instrucciones: 'Instrucción en español.',
      pasos: ['Paso 1', 'Paso 2'],
      licenciaMedia: LICENCIA_MEDIA,
      atribucionMedia: '© Gym visual — https://gymvisual.com/',
    });
  });

  it('usa el español de instructions/instruction_steps, no otro idioma', () => {
    const resultado = mapExerciseFields(itemCompleto, () => null);
    expect(resultado.instrucciones).toBe('Instrucción en español.');
    expect(resultado.pasos).toEqual(['Paso 1', 'Paso 2']);
  });

  it('resuelve equipment/image/gif_url null a null, sin romper (defensivo, el dataset real no tiene huecos hoy pero el schema los permite)', () => {
    const itemSinMedia: DatasetExercise = {
      ...itemCompleto,
      equipment: null,
      image: null,
      gif_url: null,
    };
    const resolver = jest.fn(() => 'no debería llamarse con ruta null');

    const resultado = mapExerciseFields(itemSinMedia, resolver);

    expect(resultado.equipamiento).toBeNull();
    expect(resultado.imageUrl).toBeNull();
    expect(resultado.gifUrl).toBeNull();
  });

  it('usa el fallback de atribución si el dataset no trae el campo attribution', () => {
    const { attribution, ...itemSinAtribucion } = itemCompleto;
    const resultado = mapExerciseFields(itemSinAtribucion as DatasetExercise, () => null);
    expect(resultado.atribucionMedia).toBe('© Gym visual — https://gymvisual.com/');
  });

  it('gruposMuscularesSecundarios vacío si el dataset no trae secondary_muscles', () => {
    const { secondary_muscles, ...resto } = itemCompleto;
    const itemSinSecundarios = {
      ...resto,
      secondary_muscles: undefined,
    } as unknown as DatasetExercise;

    const resultado = mapExerciseFields(itemSinSecundarios, () => null);

    expect(resultado.gruposMuscularesSecundarios).toEqual([]);
  });
});

describe('validarDatasetExercise', () => {
  it('no lanza con un item válido', () => {
    expect(() => validarDatasetExercise(itemCompleto, 0)).not.toThrow();
  });

  it('lanza si falta id, mencionando el índice', () => {
    const { id, ...resto } = itemCompleto;
    expect(() => validarDatasetExercise(resto as DatasetExercise, 5)).toThrow(/índice 5/);
  });

  it('lanza si falta name, mencionando el id', () => {
    const { name, ...resto } = itemCompleto;
    expect(() => validarDatasetExercise({ ...resto, id: '0099' } as DatasetExercise, 0)).toThrow(
      /0099/,
    );
  });

  it('lanza si falta body_part', () => {
    const { body_part, ...resto } = itemCompleto;
    expect(() => validarDatasetExercise({ ...resto, id: '0099' } as DatasetExercise, 0)).toThrow(
      /body_part/,
    );
  });
});
