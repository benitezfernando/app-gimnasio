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
import Image from 'next/image';
import { Dumbbell, GripVertical, ListPlus, MoreVertical, Pencil, X } from 'lucide-react';
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
import { GradientIcon } from './ui/gradient-icon';
import { ExerciseCardData } from './exercise-card';
import { RenameExerciseDialog } from './rename-exercise-dialog';
import { ExerciseDetailDialog } from './exercise-detail-dialog';
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
  onRenombrar,
  onVerDetalle,
  puedeRenombrar,
}: {
  ejercicio: EjercicioEnEdicion;
  destinos: DestinoParaMover[];
  onCambiar: (campo: CampoEditable, valor: string) => void;
  onQuitar: () => void;
  onMover: (diaUid: string) => void;
  onRenombrar: () => void;
  onVerDetalle: () => void;
  puedeRenombrar: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: ejercicio.uid,
  });
  const estilo = { transform: CSS.Transform.toString(transform), transition };
  const campos: Array<{ campo: CampoEditable; etiqueta: string; min: number; step?: number }> = [
    { campo: 'series', etiqueta: 'Series', min: 1 },
    { campo: 'repeticiones', etiqueta: 'Reps', min: 1 },
    { campo: 'peso', etiqueta: 'Peso (kg)', min: 0, step: 0.5 },
  ];

  return (
    <li ref={setNodeRef} style={estilo}>
      {/*
        flex-wrap + order: en celular los campos (basis-full) bajan a un
        segundo renglón y el nombre conserva el ancho; desde sm todo va en
        una fila.
      */}
      <Card className="flex flex-row flex-wrap items-center gap-x-1 gap-y-2 p-2.5! sm:flex-nowrap sm:gap-2 sm:p-3!">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="order-1 shrink-0 text-muted-foreground"
          {...attributes}
          {...listeners}
          aria-label={`Reordenar ${ejercicio.nombre}`}
        >
          <GripVertical size={20} aria-hidden />
        </Button>

        <button
          type="button"
          onClick={onVerDetalle}
          aria-label={`Ver detalle de ${ejercicio.nombre}`}
          className="relative order-2 h-10 w-10 shrink-0 overflow-hidden rounded-full bg-background transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {ejercicio.imageUrl ? (
            <Image
              src={ejercicio.imageUrl}
              alt=""
              fill
              unoptimized
              sizes="40px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <GradientIcon icon={Dumbbell} size={16} />
            </div>
          )}
        </button>

        <div className="order-3 flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className="min-w-0 break-words text-sm font-medium leading-tight text-foreground">
            {ejercicio.nombre}
          </span>
          {puedeRenombrar && (
            <button
              type="button"
              onClick={onRenombrar}
              aria-label={`Renombrar ejercicio ${ejercicio.nombre}`}
              className="inline-flex items-center gap-1 rounded text-xs text-primary-soft hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Pencil size={12} aria-hidden />
              Renombrar Ejercicio
            </button>
          )}
        </div>

        <div className="order-5 flex basis-full gap-2 pl-11 sm:order-4 sm:basis-auto sm:shrink-0 sm:pl-0">
          {campos.map(({ campo, etiqueta, min, step }) => (
            <div key={campo} className="flex flex-col gap-1">
              <Label
                htmlFor={`${ejercicio.uid}-${campo}`}
                className="text-xs text-muted-foreground"
              >
                {etiqueta}
              </Label>
              <Input
                id={`${ejercicio.uid}-${campo}`}
                type="number"
                min={min}
                step={step}
                value={campo === 'peso' ? (ejercicio.peso ?? '') : ejercicio[campo]}
                placeholder={campo === 'peso' ? '—' : undefined}
                onChange={(e) => onCambiar(campo, e.target.value)}
                className="w-16 px-2"
              />
            </div>
          ))}
        </div>

        <div className="order-4 flex shrink-0 items-center sm:order-5">
          {destinos.length > 0 && (
            <DropdownMenu modal={false}>
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
        </div>
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
  onRenombrado,
  puedeRenombrar = true,
}: {
  ejercicios: EjercicioEnEdicion[];
  onChange: (ejercicios: EjercicioEnEdicion[]) => void;
  destinosParaMover: DestinoParaMover[];
  onMoverADia: (ejercicioUid: string, diaUid: string) => void;
  /** El alias vale para todo el perfil: el padre actualiza todas las líneas con ese ejercicio, en todos los días. */
  onRenombrado: (exerciseId: string, nombre: string, nombreCatalogo: string | null) => void;
  /** false cuando la rutina es de otro profesor: el alias que se editaría no es el que ven sus nombres. */
  puedeRenombrar?: boolean;
}) {
  const [renombrando, setRenombrando] = useState<EjercicioEnEdicion | null>(null);
  const [viendoDetalle, setViendoDetalle] = useState<EjercicioEnEdicion | null>(null);
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
        nombreCatalogo: ejercicio.nombreCatalogo ?? null,
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
                  onRenombrar={() => setRenombrando(ejercicio)}
                  onVerDetalle={() => setViendoDetalle(ejercicio)}
                  puedeRenombrar={puedeRenombrar}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {viendoDetalle && (
        <ExerciseDetailDialog
          key={viendoDetalle.uid}
          exerciseId={viendoDetalle.exerciseId}
          nombre={viendoDetalle.nombre}
          onCerrar={() => setViendoDetalle(null)}
        />
      )}

      {renombrando && (
        <RenameExerciseDialog
          key={renombrando.uid}
          ejercicio={renombrando}
          onCerrar={() => setRenombrando(null)}
          onRenombrado={(exerciseId, nombre, nombreCatalogo) => {
            onRenombrado(exerciseId, nombre, nombreCatalogo);
            setRenombrando(null);
          }}
        />
      )}
    </div>
  );
}
