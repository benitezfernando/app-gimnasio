import { PARTES_CUERPO, ETIQUETA_PARTE_CUERPO } from './region-colors';
import { EQUIPAMIENTOS, ETIQUETA_EQUIPAMIENTO } from './equipment-options';
import { GRUPOS_MUSCULARES, ETIQUETA_GRUPO_MUSCULAR } from './muscle-group-options';

describe('tablas de traducción de taxonomía', () => {
  it('ETIQUETA_PARTE_CUERPO cubre exactamente los 10 valores de PARTES_CUERPO', () => {
    expect(Object.keys(ETIQUETA_PARTE_CUERPO).sort()).toEqual([...PARTES_CUERPO].sort());
  });

  it('ETIQUETA_EQUIPAMIENTO cubre exactamente los 28 valores de EQUIPAMIENTOS', () => {
    expect(Object.keys(ETIQUETA_EQUIPAMIENTO).sort()).toEqual([...EQUIPAMIENTOS].sort());
  });

  it('ETIQUETA_GRUPO_MUSCULAR cubre exactamente los 19 valores de GRUPOS_MUSCULARES', () => {
    expect(Object.keys(ETIQUETA_GRUPO_MUSCULAR).sort()).toEqual([...GRUPOS_MUSCULARES].sort());
  });
});
