'use client';

import { useId, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/confirm-dialog';
import { DayExercisesList } from './day-exercises-list';
import { ImportTemplateDayDialog } from './import-template-day-dialog';
import { DiaEnEdicion, PlantillaParaImportar } from '../lib/routine-types';
import {
  MAX_DIAS,
  MAX_EJERCICIOS_TOTALES,
  SeleccionImportacion,
  actualizarEjerciciosDeDia,
  agregarDia,
  crearDiaVacio,
  eliminarDia,
  importarDePlantilla,
  moverDia,
  moverEjercicioADia,
  totalEjercicios,
} from '../lib/routine-days';

export interface ImportacionDePlantillas {
  plantillas: Array<{ id: string; nombre: string }>;
  onPlantillaCompletaImportada?: (nombre: string) => void;
}

export function RoutineDaysEditor({
  diasIniciales,
  onGuardar,
  guardando,
  error,
  textoGuardar = 'Guardar',
  permiteGuardarVacio = true,
  importacion,
}: {
  diasIniciales: DiaEnEdicion[];
  onGuardar: (dias: DiaEnEdicion[], opciones: { vincular: boolean }) => Promise<void>;
  guardando: boolean;
  error: string | null;
  textoGuardar?: string;
  permiteGuardarVacio?: boolean;
  importacion?: ImportacionDePlantillas;
}) {
  const confirmar = useConfirm();
  const idSincronizado = useId();
  const [dias, setDias] = useState<DiaEnEdicion[]>(() =>
    diasIniciales.length > 0 ? diasIniciales : [crearDiaVacio()],
  );
  const [activoUid, setActivoUid] = useState(() => (diasIniciales[0] ?? dias[0]).uid);
  const [vincular, setVincular] = useState(false);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);

  const indiceActivo = Math.max(
    0,
    dias.findIndex((d) => d.uid === activoUid),
  );
  const activo = dias[indiceActivo];
  const total = totalEjercicios(dias);
  const variosDias = dias.length >= 2;

  function agregar() {
    const siguientes = agregarDia(dias);
    setDias(siguientes);
    setActivoUid(siguientes[siguientes.length - 1].uid);
  }

  async function eliminarActivo() {
    if (
      activo.ejercicios.length > 0 &&
      !(await confirmar({
        titulo: `¿Eliminar el Día ${indiceActivo + 1}?`,
        descripcion: 'Se quitan sus ejercicios. Los días siguientes se renumeran.',
        confirmarLabel: 'Eliminar día',
        destructiva: true,
      }))
    ) {
      return;
    }
    const restantes = eliminarDia(dias, activo.uid);
    const siguientes = restantes.length > 0 ? restantes : [crearDiaVacio()];
    setDias(siguientes);
    setActivoUid(siguientes[Math.max(0, indiceActivo - 1)].uid);
  }

  function importar(plantilla: PlantillaParaImportar, seleccion: SeleccionImportacion) {
    const base = dias.length === 1 && dias[0].ejercicios.length === 0 && !dias[0].id ? [] : dias;
    const siguientes = importarDePlantilla(base, plantilla, seleccion);
    setDias(siguientes);
    if (seleccion.diaId === 'todos') {
      setActivoUid(siguientes[0].uid);
      importacion?.onPlantillaCompletaImportada?.(plantilla.nombre);
    } else {
      setActivoUid(seleccion.reemplazarUid ?? siguientes[siguientes.length - 1].uid);
    }
  }

  const destinosParaMover = dias
    .map((d, i) => ({
      uid: d.uid,
      numero: i + 1,
      exerciseIds: new Set(d.ejercicios.map((e) => e.exerciseId)),
    }))
    .filter((d) => d.uid !== activo.uid);

  return (
    <div className="flex flex-col gap-4">
      {variosDias && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Días de la rutina">
          {dias.map((d, i) => (
            <Button
              key={d.uid}
              type="button"
              aria-pressed={d.uid === activo.uid}
              variant={d.uid === activo.uid ? 'brand' : 'outline'}
              size="sm"
              className="shrink-0"
              onClick={() => setActivoUid(d.uid)}
            >
              Día {i + 1}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={agregar}
            disabled={dias.length >= MAX_DIAS}
            aria-label="Agregar día"
          >
            <Plus aria-hidden />
          </Button>
        </div>
      )}

      {(variosDias || activo.vinculoEtiqueta) && (
        <div className="flex flex-wrap items-center gap-2">
          {variosDias && (
            <h3 className="text-base font-semibold text-foreground">Día {indiceActivo + 1}</h3>
          )}
          {activo.vinculoEtiqueta && (
            <Badge variant="outline">Sincronizado · {activo.vinculoEtiqueta}</Badge>
          )}
          {variosDias && (
            <div className="ml-auto flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setDias(moverDia(dias, activo.uid, -1))}
                disabled={indiceActivo === 0}
                aria-label="Mover día antes"
              >
                <ChevronLeft aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setDias(moverDia(dias, activo.uid, 1))}
                disabled={indiceActivo === dias.length - 1}
                aria-label="Mover día después"
              >
                <ChevronRight aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={eliminarActivo}
                aria-label={`Eliminar Día ${indiceActivo + 1}`}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          )}
        </div>
      )}

      <DayExercisesList
        ejercicios={activo.ejercicios}
        onChange={(ejercicios) => setDias(actualizarEjerciciosDeDia(dias, activo.uid, ejercicios))}
        destinosParaMover={destinosParaMover}
        onMoverADia={(ejercicioUid, diaUid) =>
          setDias(moverEjercicioADia(dias, activo.uid, ejercicioUid, diaUid))
        }
      />

      <div className="flex flex-wrap gap-2">
        {!variosDias && (
          <Button type="button" variant="outline" size="sm" onClick={agregar}>
            <Plus data-icon="inline-start" aria-hidden />
            Agregar día
          </Button>
        )}
        {importacion && (
          <Button type="button" variant="outline" size="sm" onClick={() => setDialogoAbierto(true)}>
            <Download data-icon="inline-start" aria-hidden />
            Traer de plantilla
          </Button>
        )}
      </div>

      {importacion && (
        <div className="flex items-center gap-2">
          <Checkbox
            id={idSincronizado}
            checked={vincular}
            onCheckedChange={(valor) => setVincular(valor === true)}
          />
          <Label htmlFor={idSincronizado} className="text-sm text-muted-foreground">
            Mantener sincronizado con las plantillas
          </Label>
        </div>
      )}

      <p
        className={
          total > MAX_EJERCICIOS_TOTALES
            ? 'text-sm text-destructive'
            : 'text-sm text-muted-foreground'
        }
      >
        {total}/{MAX_EJERCICIOS_TOTALES} ejercicios
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        variant="brand"
        size="sm"
        className="self-start px-6"
        onClick={() => onGuardar(dias, { vincular })}
        disabled={
          guardando || total > MAX_EJERCICIOS_TOTALES || (total === 0 && !permiteGuardarVacio)
        }
      >
        {guardando && <Spinner data-icon="inline-start" />}
        {guardando ? 'Guardando...' : textoGuardar}
      </Button>

      {importacion && (
        <ImportTemplateDayDialog
          key={dialogoAbierto ? 'abierto' : 'cerrado'}
          abierto={dialogoAbierto}
          onAbiertoChange={setDialogoAbierto}
          plantillas={importacion.plantillas}
          diasActuales={dias
            .filter((d) => d.ejercicios.length > 0 || d.id)
            .map((d) => ({ uid: d.uid, numero: dias.indexOf(d) + 1 }))}
          puedeAgregar={dias.length < MAX_DIAS}
          onImportar={importar}
        />
      )}
    </div>
  );
}
