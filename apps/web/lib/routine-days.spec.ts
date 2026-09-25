import {
  MAX_DIAS,
  aPayloadDeDias,
  aPlantillaParaImportar,
  agregarDia,
  claveDeVersion,
  crearDiaVacio,
  diaInicialParaAlumno,
  diasDePlantillaAEdicion,
  diasDeRutinaAEdicion,
  eliminarDia,
  importarDePlantilla,
  moverDia,
  moverEjercicioADia,
  totalEjercicios,
} from './routine-days';
import { DiaEnEdicion, EjercicioEnEdicion, PlantillaParaImportar } from './routine-types';

function ej(exerciseId: string, uid = `u-${exerciseId}`): EjercicioEnEdicion {
  return {
    uid,
    exerciseId,
    nombre: exerciseId,
    imageUrl: null,
    series: 3,
    repeticiones: 10,
    peso: null,
    notas: null,
  };
}

function dia(
  uid: string,
  ejercicios: EjercicioEnEdicion[],
  extra: Partial<DiaEnEdicion> = {},
): DiaEnEdicion {
  return {
    uid,
    vinculadoADiaId: null,
    vinculoEtiqueta: null,
    importadoDeDiaId: null,
    ejercicios,
    ...extra,
  };
}

const plantilla: PlantillaParaImportar = {
  id: 'tpl-1',
  nombre: 'Split',
  dias: [
    {
      id: 'tday-1',
      numero: 1,
      ejercicios: [
        {
          exerciseId: 'ex-1',
          nombre: 'A',
          imageUrl: null,
          series: 4,
          repeticiones: 12,
          peso: 50,
          notas: null,
        },
      ],
    },
    {
      id: 'tday-2',
      numero: 2,
      ejercicios: [
        {
          exerciseId: 'ex-2',
          nombre: 'B',
          imageUrl: null,
          series: 3,
          repeticiones: 8,
          peso: null,
          notas: null,
        },
      ],
    },
  ],
};

describe('routine-days', () => {
  it('agregarDia agrega un día vacío y no pasa de 7', () => {
    const siete = Array.from({ length: MAX_DIAS }, (_, i) => dia(`d${i}`, []));
    expect(agregarDia([dia('d0', [])])).toHaveLength(2);
    expect(agregarDia(siete)).toBe(siete);
  });

  it('crearDiaVacio genera uids distintos', () => {
    expect(crearDiaVacio().uid).not.toBe(crearDiaVacio().uid);
  });

  it('eliminarDia y moverDia', () => {
    const dias = [dia('a', []), dia('b', []), dia('c', [])];
    expect(eliminarDia(dias, 'b').map((d) => d.uid)).toEqual(['a', 'c']);
    expect(moverDia(dias, 'b', -1).map((d) => d.uid)).toEqual(['b', 'a', 'c']);
    expect(moverDia(dias, 'c', 1)).toBe(dias);
    expect(moverDia(dias, 'a', -1)).toBe(dias);
  });

  it('moverEjercicioADia lo pasa al final del destino, y no duplica dentro de un día', () => {
    const dias = [
      dia('a', [ej('ex-1'), ej('ex-2')]),
      dia('b', [ej('ex-3')]),
      dia('c', [ej('ex-1', 'otro')]),
    ];
    const movido = moverEjercicioADia(dias, 'a', 'u-ex-2', 'b');
    expect(movido.map((d) => d.ejercicios.map((e) => e.exerciseId))).toEqual([
      ['ex-1'],
      ['ex-3', 'ex-2'],
      ['ex-1'],
    ]);
    expect(moverEjercicioADia(dias, 'a', 'u-ex-1', 'c')).toBe(dias);
  });

  it('totalEjercicios suma todos los días', () => {
    expect(totalEjercicios([dia('a', [ej('ex-1')]), dia('b', [ej('ex-2'), ej('ex-3')])])).toBe(3);
  });

  it('importar plantilla completa reemplaza todos los días y marca su origen', () => {
    const resultado = importarDePlantilla([dia('a', [ej('ex-9')])], plantilla, {
      diaId: 'todos',
      reemplazarUid: null,
    });
    expect(
      resultado.map((d) => [d.importadoDeDiaId, d.ejercicios.map((e) => e.exerciseId), d.id]),
    ).toEqual([
      ['tday-1', ['ex-1'], undefined],
      ['tday-2', ['ex-2'], undefined],
    ]);
  });

  it('importar un día como nuevo lo agrega al final', () => {
    const resultado = importarDePlantilla([dia('a', [ej('ex-9')])], plantilla, {
      diaId: 'tday-2',
      reemplazarUid: null,
    });
    expect(resultado.map((d) => d.importadoDeDiaId)).toEqual([null, 'tday-2']);
  });

  it('reemplazar un día conserva su uid e id persistido y cambia el contenido', () => {
    const existente = dia('a', [ej('ex-9')], {
      id: 'iday-1',
      vinculadoADiaId: 'tday-x',
      vinculoEtiqueta: 'X · Día 1',
    });
    const [resultado] = importarDePlantilla([existente], plantilla, {
      diaId: 'tday-1',
      reemplazarUid: 'a',
    });
    expect(resultado).toMatchObject({
      uid: 'a',
      id: 'iday-1',
      importadoDeDiaId: 'tday-1',
      vinculoEtiqueta: null,
    });
    expect(resultado.ejercicios.map((e) => e.exerciseId)).toEqual(['ex-1']);
  });

  it('aPayloadDeDias: descarta días vacíos, numera orden, y resuelve el vínculo según la casilla', () => {
    const dias = [
      dia('a', [ej('ex-1'), ej('ex-2')], { id: 'iday-1', vinculadoADiaId: 'tday-1' }),
      dia('b', []),
      dia('c', [ej('ex-3')], { importadoDeDiaId: 'tday-7' }),
    ];
    expect(aPayloadDeDias(dias, { vincular: false, incluirIds: true })).toEqual([
      {
        id: 'iday-1',
        vinculadoADiaId: 'tday-1',
        ejercicios: [
          { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10 },
          { exerciseId: 'ex-2', orden: 2, series: 3, repeticiones: 10 },
        ],
      },
      { ejercicios: [{ exerciseId: 'ex-3', orden: 1, series: 3, repeticiones: 10 }] },
    ]);
    expect(aPayloadDeDias(dias, { vincular: true, incluirIds: false })[1]).toEqual({
      vinculadoADiaId: 'tday-7',
      ejercicios: [{ exerciseId: 'ex-3', orden: 1, series: 3, repeticiones: 10 }],
    });
    expect(aPayloadDeDias(dias, { vincular: true, incluirIds: false })[0]).not.toHaveProperty('id');
  });

  it('diasDePlantillaAEdicion resuelve nombres y diasDeRutinaAEdicion arma la etiqueta del vínculo', () => {
    const [d] = diasDePlantillaAEdicion(
      [
        {
          id: 'tday-1',
          numero: 1,
          ejercicios: [
            { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, peso: null, notas: null },
          ],
        },
      ],
      new Map([['ex-1', { nombre: 'Sentadilla', imageUrl: null }]]),
    );
    expect(d).toMatchObject({ id: 'tday-1', vinculadoADiaId: null });
    expect(d.ejercicios[0].nombre).toBe('Sentadilla');

    const [r] = diasDeRutinaAEdicion([
      {
        id: 'iday-1',
        numero: 1,
        vinculado: { diaId: 'tday-2', templateId: 'tpl-1', templateNombre: 'Piernas', numero: 2 },
        ejercicios: [
          {
            exerciseId: 'ex-1',
            nombre: 'Sentadilla',
            imageUrl: null,
            orden: 1,
            series: 3,
            repeticiones: 10,
            peso: null,
            notas: null,
          },
        ],
      },
    ]);
    expect(r).toMatchObject({
      id: 'iday-1',
      vinculadoADiaId: 'tday-2',
      vinculoEtiqueta: 'Piernas · Día 2',
    });
  });

  it('aPlantillaParaImportar ordena días y resuelve nombres', () => {
    const resultado = aPlantillaParaImportar(
      {
        id: 'tpl-1',
        nombre: 'Split',
        activa: true,
        dias: [
          { id: 'b', numero: 2, ejercicios: [] },
          {
            id: 'a',
            numero: 1,
            ejercicios: [
              {
                exerciseId: 'ex-1',
                orden: 1,
                series: 3,
                repeticiones: 10,
                peso: null,
                notas: null,
              },
            ],
          },
        ],
      },
      new Map([['ex-1', { nombre: 'Remo', imageUrl: 'x' }]]),
    );
    expect(resultado.dias.map((d) => d.id)).toEqual(['a', 'b']);
    expect(resultado.dias[0].ejercicios[0]).toMatchObject({ nombre: 'Remo', imageUrl: 'x' });
  });

  it('claveDeVersion cambia cuando cambian ids, vínculos o cantidad de ejercicios', () => {
    const base = [dia('a', [ej('ex-1')], { id: 'x' })];
    expect(claveDeVersion(base)).toBe(claveDeVersion([dia('otro-uid', [ej('ex-1')], { id: 'x' })]));
    expect(claveDeVersion(base)).not.toBe(claveDeVersion([dia('a', [ej('ex-1')], { id: 'y' })]));
    expect(claveDeVersion(base)).not.toBe(
      claveDeVersion([dia('a', [ej('ex-1'), ej('ex-2')], { id: 'x' })]),
    );
  });

  it('diaInicialParaAlumno usa el guardado si es válido y si no Día 1', () => {
    expect(diaInicialParaAlumno('3', 4)).toBe(3);
    expect(diaInicialParaAlumno('5', 4)).toBe(1);
    expect(diaInicialParaAlumno(null, 4)).toBe(1);
    expect(diaInicialParaAlumno('abc', 4)).toBe(1);
    expect(diaInicialParaAlumno('0', 4)).toBe(1);
  });
});
