'use client';

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
import { GripVertical, ListPlus, MoreVertical, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { ExercisePicker } from './exercise-picker';
import { ExerciseCardData } from './exercise-card';
import { EjercicioEnEdicion } from '../lib/routine-types';
import { nuevoUid } from '../lib/routine-days';

export interface DestinoParaMover {
  uid: string;
  numero: number;
  exerciseIds: Set<string>;
}

type CampoEditable = 'series' | 'repeticiones' | 'peso';

function FilaEjercicio({
  ejercicio,
  destinos,
  onCambiar,
  onQuitar,
  onMover,
}: {
  ejercicio: EjercicioEnEdicion;
  destinos: DestinoParaMover[];
  onCambiar: (campo: CampoEditable, valor: string) => void;
  onQuitar: () => void;
  onMover: (diaUid: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: ejercicio.uid,
  });
  const estilo = { transform: CSS.Transform.toString(transform), transition };
  const campos: Array<{
    campo: CampoEditable;
    corto: string;
    largo: string;
    min: number;
    step?: number;
  }> = [
    { campo: 'series', corto: 'Series', largo: 'Series', min: 1 },
    { campo: 'repeticiones', corto: 'Reps', largo: 'Reps', min: 1 },
    { campo: 'peso', corto: 'Peso', largo: 'Peso (kg)', min: 0, step: 0.5 },
  ];

  return (
    <li ref={setNodeRef} style={estilo}>
      <Card className="flex flex-row items-center gap-1 p-2.5! sm:gap-2 sm:p-3!">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground"
          {...attributes}
          {...listeners}
          aria-label={`Reordenar ${ejercicio.nombre}`}
        >
          <GripVertical size={20} aria-hidden />
        </Button>

        <span className="min-w-0 flex-1 break-words text-sm font-medium leading-tight text-foreground">
          {ejercicio.nombre}
        </span>

        <div className="flex shrink-0 gap-1 sm:gap-2">
          {campos.map(({ campo, corto, largo, min, step }) => (
            <div key={campo} className="flex flex-col gap-1">
              <Label
                htmlFor={`${ejercicio.uid}-${campo}`}
                className="text-xs text-muted-foreground"
              >
                <span className="sm:hidden">{corto}</span>
                <span className="hidden sm:inline">{largo}</span>
              </Label>
              <Input
                id={`${ejercicio.uid}-${campo}`}
                type="number"
                min={min}
                step={step}
                value={campo === 'peso' ? (ejercicio.peso ?? '') : ejercicio[campo]}
                placeholder={campo === 'peso' ? '—' : undefined}
                onChange={(e) => onCambiar(campo, e.target.value)}
                className="w-10 px-1 text-center sm:w-16 sm:px-2 sm:text-left"
              />
            </div>
          ))}
        </div>

        {destinos.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground"
                aria-label={`Más opciones de ${ejercicio.nombre}`}
              >
                <MoreVertical size={18} aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Mover a</DropdownMenuLabel>
              {destinos.map((destino) => (
                <DropdownMenuItem
                  key={destino.uid}
                  disabled={destino.exerciseIds.has(ejercicio.exerciseId)}
                  onSelect={() => onMover(destino.uid)}
                >
                  Día {destino.numero}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-destructive hover:text-destructive"
          onClick={onQuitar}
          aria-label={`Quitar ${ejercicio.nombre}`}
        >
          <X size={18} aria-hidden />
        </Button>
      </Card>
    </li>
  );
}

/** Lista controlada de los ejercicios de UN día: agregar, quitar, editar valores, reordenar y mover a otro día. */
export function DayExercisesList({
  ejercicios,
  onChange,
  destinosParaMover,
  onMoverADia,
}: {
  ejercicios: EjercicioEnEdicion[];
  onChange: (ejercicios: EjercicioEnEdicion[]) => void;
  destinosParaMover: DestinoParaMover[];
  onMoverADia: (ejercicioUid: string, diaUid: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function agregar(ejercicio: ExerciseCardData) {
    if (ejercicios.some((e) => e.exerciseId === ejercicio.id)) return;
    onChange([
      ...ejercicios,
      {
        uid: nuevoUid(),
        exerciseId: ejercicio.id,
        nombre: ejercicio.nombre,
        imageUrl: ejercicio.imageUrl,
        series: 3,
        repeticiones: 10,
        peso: null,
        notas: null,
      },
    ]);
  }

  function cambiar(uid: string, campo: CampoEditable, valor: string) {
    onChange(
      ejercicios.map((e) => {
        if (e.uid !== uid) return e;
        if (campo === 'peso') return { ...e, peso: valor === '' ? null : Number(valor) };
        return { ...e, [campo]: Number(valor) };
      }),
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const desde = ejercicios.findIndex((e) => e.uid === active.id);
    const hasta = ejercicios.findIndex((e) => e.uid === over.id);
    onChange(arrayMove(ejercicios, desde, hasta));
  }

  return (
    <div className="flex flex-col gap-4">
      <ExercisePicker onAgregar={agregar} />

      {ejercicios.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListPlus />
            </EmptyMedia>
            <EmptyTitle>Este día todavía no tiene ejercicios</EmptyTitle>
            <EmptyDescription>Buscá uno arriba para empezar.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={ejercicios.map((e) => e.uid)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-2">
              {ejercicios.map((ejercicio) => (
                <FilaEjercicio
                  key={ejercicio.uid}
                  ejercicio={ejercicio}
                  destinos={destinosParaMover}
                  onCambiar={(campo, valor) => cambiar(ejercicio.uid, campo, valor)}
                  onQuitar={() => onChange(ejercicios.filter((e) => e.uid !== ejercicio.uid))}
                  onMover={(diaUid) => onMoverADia(ejercicio.uid, diaUid)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
