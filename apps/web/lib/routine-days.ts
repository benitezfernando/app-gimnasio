import {
  DiaEnEdicion,
  EjercicioApi,
  EjercicioEnEdicion,
  EjercicioPayload,
  PlantillaParaImportar,
  TemplateDetailApi,
  aPayloadDeEjercicios,
} from './routine-types';

export const MAX_DIAS = 7;
export const MAX_EJERCICIOS_TOTALES = 50;

export function nuevoUid(): string {
  return crypto.randomUUID();
}

export function crearDiaVacio(): DiaEnEdicion {
  return {
    uid: nuevoUid(),
    vinculadoADiaId: null,
    vinculoEtiqueta: null,
    importadoDeDiaId: null,
    ejercicios: [],
  };
}

export function agregarDia(dias: DiaEnEdicion[]): DiaEnEdicion[] {
  return dias.length >= MAX_DIAS ? dias : [...dias, crearDiaVacio()];
}

export function eliminarDia(dias: DiaEnEdicion[], uid: string): DiaEnEdicion[] {
  return dias.filter((d) => d.uid !== uid);
}

export function moverDia(dias: DiaEnEdicion[], uid: string, delta: -1 | 1): DiaEnEdicion[] {
  const desde = dias.findIndex((d) => d.uid === uid);
  const hasta = desde + delta;
  if (desde === -1 || hasta < 0 || hasta >= dias.length) return dias;
  const copia = [...dias];
  [copia[desde], copia[hasta]] = [copia[hasta], copia[desde]];
  return copia;
}

export function actualizarEjerciciosDeDia(
  dias: DiaEnEdicion[],
  uid: string,
  ejercicios: EjercicioEnEdicion[],
): DiaEnEdicion[] {
  return dias.map((d) => (d.uid === uid ? { ...d, ejercicios } : d));
}

export function moverEjercicioADia(
  dias: DiaEnEdicion[],
  desdeUid: string,
  ejercicioUid: string,
  haciaUid: string,
): DiaEnEdicion[] {
  const origen = dias.find((d) => d.uid === desdeUid);
  const destino = dias.find((d) => d.uid === haciaUid);
  const ejercicio = origen?.ejercicios.find((e) => e.uid === ejercicioUid);
  if (!origen || !destino || !ejercicio || origen === destino) return dias;
  if (destino.ejercicios.some((e) => e.exerciseId === ejercicio.exerciseId)) return dias;
  return dias.map((d) => {
    if (d.uid === desdeUid)
      return { ...d, ejercicios: d.ejercicios.filter((e) => e.uid !== ejercicioUid) };
    if (d.uid === haciaUid) return { ...d, ejercicios: [...d.ejercicios, ejercicio] };
    return d;
  });
}

export function totalEjercicios(dias: DiaEnEdicion[]): number {
  return dias.reduce((suma, d) => suma + d.ejercicios.length, 0);
}

export interface SeleccionImportacion {
  diaId: string | 'todos';
  /** `null` = agregar como día nuevo. Se ignora con `diaId: 'todos'`. */
  reemplazarUid: string | null;
}

export function importarDePlantilla(
  dias: DiaEnEdicion[],
  plantilla: PlantillaParaImportar,
  seleccion: SeleccionImportacion,
): DiaEnEdicion[] {
  const aEdicion = (diaPlantilla: PlantillaParaImportar['dias'][number]): EjercicioEnEdicion[] =>
    diaPlantilla.ejercicios.map((e) => ({ ...e, uid: nuevoUid() }));

  if (seleccion.diaId === 'todos') {
    return plantilla.dias.slice(0, MAX_DIAS).map((d) => ({
      ...crearDiaVacio(),
      importadoDeDiaId: d.id,
      ejercicios: aEdicion(d),
    }));
  }

  const diaPlantilla = plantilla.dias.find((d) => d.id === seleccion.diaId);
  if (!diaPlantilla) return dias;

  if (seleccion.reemplazarUid) {
    return dias.map((d) =>
      d.uid === seleccion.reemplazarUid
        ? {
            ...d,
            vinculoEtiqueta: null,
            importadoDeDiaId: diaPlantilla.id,
            ejercicios: aEdicion(diaPlantilla),
          }
        : d,
    );
  }
  if (dias.length >= MAX_DIAS) return dias;
  return [
    ...dias,
    { ...crearDiaVacio(), importadoDeDiaId: diaPlantilla.id, ejercicios: aEdicion(diaPlantilla) },
  ];
}

export interface DiaPayload {
  id?: string;
  vinculadoADiaId?: string;
  ejercicios: EjercicioPayload[];
}

export function aPayloadDeDias(
  dias: DiaEnEdicion[],
  opciones: { vincular: boolean; incluirIds: boolean },
): DiaPayload[] {
  return dias
    .filter((d) => d.ejercicios.length > 0)
    .map((d) => {
      const vinculo = d.importadoDeDiaId
        ? opciones.vincular
          ? d.importadoDeDiaId
          : null
        : d.vinculadoADiaId;
      return {
        ...(opciones.incluirIds && d.id ? { id: d.id } : {}),
        ...(vinculo ? { vinculadoADiaId: vinculo } : {}),
        ejercicios: aPayloadDeEjercicios(d.ejercicios),
      };
    });
}

type DetalleEjercicio = { nombre: string; imageUrl: string | null };

function ejercicioApiADatos(
  e: EjercicioApi,
  detalle: DetalleEjercicio | undefined,
): Omit<EjercicioEnEdicion, 'uid'> {
  return {
    exerciseId: e.exerciseId,
    nombre: detalle?.nombre ?? '(ejercicio no encontrado)',
    imageUrl: detalle?.imageUrl ?? null,
    series: e.series,
    repeticiones: e.repeticiones,
    peso: e.peso,
    notas: e.notas,
  };
}

function ejercicioApiAEdicion(
  e: EjercicioApi,
  detalle: DetalleEjercicio | undefined,
): EjercicioEnEdicion {
  return { uid: nuevoUid(), ...ejercicioApiADatos(e, detalle) };
}

export function diasDePlantillaAEdicion(
  dias: TemplateDetailApi['dias'],
  detallePorId: Map<string, DetalleEjercicio>,
): DiaEnEdicion[] {
  return [...dias]
    .sort((a, b) => a.numero - b.numero)
    .map((d) => ({
      uid: nuevoUid(),
      id: d.id,
      vinculadoADiaId: null,
      vinculoEtiqueta: null,
      importadoDeDiaId: null,
      ejercicios: d.ejercicios.map((e) => ejercicioApiAEdicion(e, detallePorId.get(e.exerciseId))),
    }));
}

export interface DiaRutinaApi {
  id: string;
  numero: number;
  vinculado: { diaId: string; templateId: string; templateNombre: string; numero: number } | null;
  ejercicios: Array<EjercicioApi & DetalleEjercicio>;
}

/** `vinculadoADiaId` se reenvía tal cual al guardar: sin él, cada guardado desvincularía el día. */
export function diasDeRutinaAEdicion(dias: DiaRutinaApi[]): DiaEnEdicion[] {
  return [...dias]
    .sort((a, b) => a.numero - b.numero)
    .map((d) => ({
      uid: nuevoUid(),
      id: d.id,
      vinculadoADiaId: d.vinculado?.diaId ?? null,
      vinculoEtiqueta: d.vinculado
        ? `${d.vinculado.templateNombre} · Día ${d.vinculado.numero}`
        : null,
      importadoDeDiaId: null,
      ejercicios: d.ejercicios.map((e) => ejercicioApiAEdicion(e, e)),
    }));
}

export function aPlantillaParaImportar(
  detalle: TemplateDetailApi,
  detallePorId: Map<string, DetalleEjercicio>,
): PlantillaParaImportar {
  return {
    id: detalle.id,
    nombre: detalle.nombre,
    dias: [...detalle.dias]
      .sort((a, b) => a.numero - b.numero)
      .map((d) => ({
        id: d.id,
        numero: d.numero,
        ejercicios: d.ejercicios.map((e) => ejercicioApiADatos(e, detallePorId.get(e.exerciseId))),
      })),
  };
}

/** Clave para remontar el editor cuando el servidor devuelve otra estructura (ids nuevos tras guardar). */
export function claveDeVersion(dias: DiaEnEdicion[]): string {
  return dias
    .map((d) => `${d.id ?? 'nuevo'}:${d.vinculadoADiaId ?? '-'}:${d.ejercicios.length}`)
    .join('|');
}

export function claveDiaAlumno(rutinaId: string): string {
  return `rutina-dia:${rutinaId}`;
}

export function diaInicialParaAlumno(guardado: string | null, cantidadDias: number): number {
  const numero = Number(guardado);
  return Number.isInteger(numero) && numero >= 1 && numero <= cantidadDias ? numero : 1;
}
