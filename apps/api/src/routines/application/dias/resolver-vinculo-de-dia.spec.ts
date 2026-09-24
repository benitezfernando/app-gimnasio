import { resolverVinculoDeDia, DiaPlantillaReferenciado } from './resolver-vinculo-de-dia';
import { RoutineTemplateNotFoundError } from '../errors/routine-template-not-found.error';

const diaPiernas: DiaPlantillaReferenciado = {
  id: 'tday-1',
  exerciseIds: ['ex-1', 'ex-2'],
  esDelInvocador: true,
};

describe('resolverVinculoDeDia', () => {
  it('sin pedido de vínculo, el día queda independiente', () => {
    expect(
      resolverVinculoDeDia({
        pedido: undefined,
        anterior: 'tday-1',
        exerciseIdsDelDia: ['ex-1', 'ex-2'],
        diaPlantilla: undefined,
      }),
    ).toBeNull();
  });

  it('vínculo nuevo con el mismo conjunto de ejercicios (en otro orden) queda vinculado', () => {
    expect(
      resolverVinculoDeDia({
        pedido: 'tday-1',
        anterior: null,
        exerciseIdsDelDia: ['ex-2', 'ex-1'],
        diaPlantilla: diaPiernas,
      }),
    ).toBe('tday-1');
  });

  it('vínculo nuevo con un conjunto distinto queda independiente (importado y modificado)', () => {
    expect(
      resolverVinculoDeDia({
        pedido: 'tday-1',
        anterior: null,
        exerciseIdsDelDia: ['ex-1', 'ex-3'],
        diaPlantilla: diaPiernas,
      }),
    ).toBeNull();
  });

  it('mismo largo pero un ejercicio distinto cuenta como divergencia', () => {
    expect(
      resolverVinculoDeDia({
        pedido: 'tday-1',
        anterior: 'tday-1',
        exerciseIdsDelDia: ['ex-1', 'ex-9'],
        diaPlantilla: diaPiernas,
      }),
    ).toBeNull();
  });

  it('vínculo nuevo a un día de plantilla ajena → 404', () => {
    expect(() =>
      resolverVinculoDeDia({
        pedido: 'tday-1',
        anterior: null,
        exerciseIdsDelDia: ['ex-1', 'ex-2'],
        diaPlantilla: { ...diaPiernas, esDelInvocador: false },
      }),
    ).toThrow(RoutineTemplateNotFoundError);
  });

  it('vínculo nuevo a un día inexistente → 404', () => {
    expect(() =>
      resolverVinculoDeDia({
        pedido: 'tday-x',
        anterior: null,
        exerciseIdsDelDia: ['ex-1'],
        diaPlantilla: undefined,
      }),
    ).toThrow(RoutineTemplateNotFoundError);
  });

  it('vínculo ya existente a una plantilla de otro profesor de la cartera se conserva', () => {
    expect(
      resolverVinculoDeDia({
        pedido: 'tday-1',
        anterior: 'tday-1',
        exerciseIdsDelDia: ['ex-1', 'ex-2'],
        diaPlantilla: { ...diaPiernas, esDelInvocador: false },
      }),
    ).toBe('tday-1');
  });

  it('vínculo existente cuyo día de plantilla ya no existe queda independiente sin error', () => {
    expect(
      resolverVinculoDeDia({
        pedido: 'tday-1',
        anterior: 'tday-1',
        exerciseIdsDelDia: ['ex-1', 'ex-2'],
        diaPlantilla: undefined,
      }),
    ).toBeNull();
  });
});
