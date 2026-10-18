import { resolverDiasDeRutina } from './resolver-dias-de-rutina';
import {
  ExerciseRepositoryPort,
  ExerciseSummary,
} from '../../exercise-catalog/application/ports/exercise-repository.port';

describe('resolverDiasDeRutina', () => {
  let exerciseRepository: jest.Mocked<ExerciseRepositoryPort>;

  const dias = [
    {
      numero: 1,
      ejercicios: [
        { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, peso: null, notas: null },
      ],
    },
  ];

  const conAlias: ExerciseSummary = {
    id: 'ex-1',
    nombre: 'Banca plana',
    nombreCatalogo: 'Barra press de banca',
    nombreOriginal: null,
    imageUrl: null,
    gifUrl: null,
    parteCuerpo: 'chest',
    grupoMuscular: 'pectorals',
    equipamiento: 'barbell',
  };

  beforeEach(() => {
    exerciseRepository = { findMany: jest.fn(), findById: jest.fn(), findByIds: jest.fn() };
  });

  it('con profesor dueño pide los nombres con su alias y expone nombre y nombreCatalogo', async () => {
    exerciseRepository.findByIds.mockResolvedValue([conAlias]);

    const [dia] = await resolverDiasDeRutina(exerciseRepository, dias, 'prof-1');

    expect(exerciseRepository.findByIds).toHaveBeenCalledWith(['ex-1'], 'prof-1');
    expect(dia.ejercicios[0]).toMatchObject({
      nombre: 'Banca plana',
      nombreCatalogo: 'Barra press de banca',
    });
  });

  it('sin profesor dueño (null) pide el catálogo puro, sin alias', async () => {
    exerciseRepository.findByIds.mockResolvedValue([
      { ...conAlias, nombre: 'Barra press de banca', nombreCatalogo: null },
    ]);

    const [dia] = await resolverDiasDeRutina(exerciseRepository, dias, null);

    expect(exerciseRepository.findByIds).toHaveBeenCalledWith(['ex-1'], undefined);
    expect(dia.ejercicios[0]).toMatchObject({
      nombre: 'Barra press de banca',
      nombreCatalogo: null,
    });
  });

  it('un ejercicio sin alias devuelve nombreCatalogo null aunque venga sin el campo', async () => {
    const sinCampo: ExerciseSummary = {
      id: 'ex-1',
      nombre: 'Sentadilla',
      nombreOriginal: null,
      imageUrl: null,
      gifUrl: null,
      parteCuerpo: 'upper legs',
      grupoMuscular: 'quads',
      equipamiento: 'barbell',
    };
    exerciseRepository.findByIds.mockResolvedValue([sinCampo]);

    const [dia] = await resolverDiasDeRutina(exerciseRepository, dias, 'prof-1');

    expect(dia.ejercicios[0].nombreCatalogo).toBeNull();
  });

  it('un ejercicio que ya no existe se muestra como no encontrado, con nombreCatalogo null', async () => {
    exerciseRepository.findByIds.mockResolvedValue([]);

    const [dia] = await resolverDiasDeRutina(exerciseRepository, dias, 'prof-1');

    expect(dia.ejercicios[0]).toMatchObject({
      nombre: '(ejercicio no encontrado)',
      nombreCatalogo: null,
    });
  });
});
