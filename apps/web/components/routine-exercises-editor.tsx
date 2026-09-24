'use client';

import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ExercisePicker } from './exercise-picker';
import { EjercicioEnEdicion } from '../lib/routine-types';
import { ExerciseCardData } from './exercise-card';
import { PrimaryButton } from './ui/primary-button';

function FilaEjercicio({
  ejercicio,
  onCambiar,
  onQuitar,
}: {
  ejercicio: EjercicioEnEdicion;
  onCambiar: (campo: 'series' | 'repeticiones' | 'peso' | 'notas', valor: string) => void;
  onQuitar: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: ejercicio.exerciseId,
  });
  const estilo = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li ref={setNodeRef} style={estilo}>
      <Card className="flex flex-row items-center gap-1 p-2.5! sm:gap-2 sm:p-3!">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reordenar ${ejercicio.nombre}`}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-muted-foreground lg:min-h-9 lg:min-w-9"
        >
          <GripVertical size={20} aria-hidden />
        </button>

        <span className="min-w-0 flex-1 break-words text-sm font-medium leading-tight text-foreground">
          {ejercicio.nombre}
        </span>

        <div className="flex shrink-0 gap-1 sm:gap-2">
          <label className="flex flex-col text-xs text-muted-foreground">
            Series
            <input
              type="number"
              min={1}
              value={ejercicio.series}
              onChange={(e) => onCambiar('series', e.target.value)}
              className="min-h-11 w-10 rounded-lg border border-border bg-background px-1 text-center text-foreground sm:w-16 sm:px-2 sm:text-left lg:min-h-9"
            />
          </label>
          <label className="flex flex-col text-xs text-muted-foreground">
            Reps
            <input
              type="number"
              min={1}
              value={ejercicio.repeticiones}
              onChange={(e) => onCambiar('repeticiones', e.target.value)}
              className="min-h-11 w-10 rounded-lg border border-border bg-background px-1 text-center text-foreground sm:w-16 sm:px-2 sm:text-left lg:min-h-9"
            />
          </label>
          <label className="flex flex-col text-xs text-muted-foreground">
            <span className="sm:hidden">Peso</span>
            <span className="hidden sm:inline">Peso (kg)</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={ejercicio.peso ?? ''}
              placeholder="—"
              onChange={(e) => onCambiar('peso', e.target.value)}
              className="min-h-11 w-10 rounded-lg border border-border bg-background px-1 text-center text-foreground sm:w-16 sm:px-2 sm:text-left lg:min-h-9"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={onQuitar}
          aria-label={`Quitar ${ejercicio.nombre}`}
          className="min-h-11 min-w-11 shrink-0 text-destructive lg:min-h-9 lg:min-w-9"
        >
          <X size={18} aria-hidden />
        </button>
      </Card>
    </li>
  );
}

/**
 * Componente compartido entre el editor de plantillas y el de instancias
 * — arma/reordena/edita la lista de ejercicios en memoria, y delega el
 * guardado (siempre replace-all) a `onGuardar`. Reordenar con dnd-kit
 * (drag táctil/mouse + flechas de teclado nativas de la librería).
 *
 * `permiteGuardarVacio`: el backend (`PUT .../exercises`) no exige un
 * mínimo de ejercicios — reemplaza con lo que se le mande, incluido un
 * array vacío. La única excepción real es crear una rutina NUEVA desde
 * cero (`POST /routine-instances` sin `origenTemplateId`), que sí exige
 * al menos uno. El caller decide cuál de los dos casos es el suyo.
 */
export function RoutineExercisesEditor({
  ejerciciosIniciales,
  onGuardar,
  guardando,
  error,
  permiteGuardarVacio = true,
}: {
  ejerciciosIniciales: EjercicioEnEdicion[];
  onGuardar: (ejercicios: EjercicioEnEdicion[]) => Promise<void>;
  guardando: boolean;
  permiteGuardarVacio?: boolean;
  error: string | null;
}) {
  const [ejercicios, setEjercicios] = useState<EjercicioEnEdicion[]>(ejerciciosIniciales);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function agregar(ejercicio: ExerciseCardData) {
    if (ejercicios.some((e) => e.exerciseId === ejercicio.id)) return;
    setEjercicios((actuales) => [
      ...actuales,
      {
        exerciseId: ejercicio.id,
        nombre: ejercicio.nombre,
        imageUrl: ejercicio.imageUrl,
        orden: actuales.length + 1,
        series: 3,
        repeticiones: 10,
        peso: null,
        notas: null,
      },
    ]);
  }

  function quitar(exerciseId: string) {
    setEjercicios((actuales) => actuales.filter((e) => e.exerciseId !== exerciseId));
  }

  function cambiarCampo(
    exerciseId: string,
    campo: 'series' | 'repeticiones' | 'peso' | 'notas',
    valor: string,
  ) {
    setEjercicios((actuales) =>
      actuales.map((e) => {
        if (e.exerciseId !== exerciseId) return e;
        if (campo === 'notas') return { ...e, notas: valor || null };
        if (campo === 'peso') return { ...e, peso: valor === '' ? null : Number(valor) };
        return { ...e, [campo]: Number(valor) };
      }),
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setEjercicios((actuales) => {
      const desde = actuales.findIndex((e) => e.exerciseId === active.id);
      const hasta = actuales.findIndex((e) => e.exerciseId === over.id);
      return arrayMove(actuales, desde, hasta);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ExercisePicker onAgregar={agregar} />

      {ejercicios.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no agregaste ningún ejercicio — buscá uno arriba para empezar.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={ejercicios.map((e) => e.exerciseId)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-2">
              {ejercicios.map((ejercicio) => (
                <FilaEjercicio
                  key={ejercicio.exerciseId}
                  ejercicio={ejercicio}
                  onCambiar={(campo, valor) => cambiarCampo(ejercicio.exerciseId, campo, valor)}
                  onQuitar={() => quitar(ejercicio.exerciseId)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <PrimaryButton
        type="button"
        onClick={() => onGuardar(ejercicios)}
        disabled={guardando || (ejercicios.length === 0 && !permiteGuardarVacio)}
        size="sm-wide"
        className="self-start"
      >
        {guardando ? 'Guardando...' : 'Guardar ejercicios'}
      </PrimaryButton>
    </div>
  );
}
