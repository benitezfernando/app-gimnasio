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
import { ExercisePicker } from './exercise-picker';
import { EjercicioEnEdicion } from '../lib/routine-types';
import { ExerciseCardData } from './exercise-card';

function FilaEjercicio({
  ejercicio,
  onCambiar,
  onQuitar,
}: {
  ejercicio: EjercicioEnEdicion;
  onCambiar: (
    campo: 'series' | 'repeticiones' | 'peso' | 'descanso' | 'notas',
    valor: string,
  ) => void;
  onQuitar: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: ejercicio.exerciseId,
  });
  const estilo = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={estilo}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-center"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reordenar ${ejercicio.nombre}`}
        className="flex min-h-11 min-w-11 items-center justify-center text-text-muted"
      >
        <GripVertical size={20} aria-hidden />
      </button>

      <span className="flex-1 text-sm font-medium text-text">{ejercicio.nombre}</span>

      <div className="grid grid-cols-4 gap-2">
        <label className="flex flex-col text-xs text-text-muted">
          Series
          <input
            type="number"
            min={1}
            value={ejercicio.series}
            onChange={(e) => onCambiar('series', e.target.value)}
            className="min-h-11 w-16 rounded-lg border border-border bg-surface px-2 text-text"
          />
        </label>
        <label className="flex flex-col text-xs text-text-muted">
          Reps
          <input
            type="number"
            min={1}
            value={ejercicio.repeticiones}
            onChange={(e) => onCambiar('repeticiones', e.target.value)}
            className="min-h-11 w-16 rounded-lg border border-border bg-surface px-2 text-text"
          />
        </label>
        <label className="flex flex-col text-xs text-text-muted">
          Peso (kg)
          <input
            type="number"
            min={0}
            step={0.5}
            value={ejercicio.peso ?? ''}
            placeholder="—"
            onChange={(e) => onCambiar('peso', e.target.value)}
            className="min-h-11 w-16 rounded-lg border border-border bg-surface px-2 text-text"
          />
        </label>
        <label className="flex flex-col text-xs text-text-muted">
          Descanso (s)
          <input
            type="number"
            min={0}
            value={ejercicio.descanso}
            onChange={(e) => onCambiar('descanso', e.target.value)}
            className="min-h-11 w-16 rounded-lg border border-border bg-surface px-2 text-text"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={onQuitar}
        aria-label={`Quitar ${ejercicio.nombre}`}
        className="min-h-11 min-w-11 text-danger"
      >
        <X size={18} aria-hidden />
      </button>
    </li>
  );
}

/**
 * Componente compartido entre el editor de plantillas y el de instancias
 * — arma/reordena/edita la lista de ejercicios en memoria, y delega el
 * guardado (siempre replace-all) a `onGuardar`. Reordenar con dnd-kit
 * (drag táctil/mouse + flechas de teclado nativas de la librería).
 */
export function RoutineExercisesEditor({
  ejerciciosIniciales,
  onGuardar,
  guardando,
  error,
}: {
  ejerciciosIniciales: EjercicioEnEdicion[];
  onGuardar: (ejercicios: EjercicioEnEdicion[]) => Promise<void>;
  guardando: boolean;
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
        descanso: 60,
        notas: null,
      },
    ]);
  }

  function quitar(exerciseId: string) {
    setEjercicios((actuales) => actuales.filter((e) => e.exerciseId !== exerciseId));
  }

  function cambiarCampo(
    exerciseId: string,
    campo: 'series' | 'repeticiones' | 'peso' | 'descanso' | 'notas',
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
        <p className="text-sm text-text-muted">
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
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => onGuardar(ejercicios)}
        disabled={guardando || ejercicios.length === 0}
        className="min-h-11 self-start rounded-lg bg-accent px-6 text-sm font-medium text-accent-fg disabled:opacity-50"
      >
        {guardando ? 'Guardando...' : 'Guardar ejercicios'}
      </button>
    </div>
  );
}
