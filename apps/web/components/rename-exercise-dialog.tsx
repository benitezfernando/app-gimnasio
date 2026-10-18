'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { browserApiFetch, BrowserApiError } from '../lib/browser-api-client';

const MAX_ALIAS = 80;

export interface EjercicioRenombrable {
  exerciseId: string;
  nombre: string;
  /** Presente solo si `nombre` ya es un alias; es el nombre del catálogo. */
  nombreCatalogo?: string | null;
}

interface EjercicioResuelto {
  nombre: string;
  nombreCatalogo?: string | null;
}

/**
 * El alias vale para todo el perfil del profesor y se guarda al instante
 * (no depende del guardado de la rutina). El padre remonta este componente
 * por ejercicio (`key`), así que el estado inicial siempre es el actual.
 */
export function RenameExerciseDialog({
  ejercicio,
  onCerrar,
  onRenombrado,
}: {
  ejercicio: EjercicioRenombrable;
  onCerrar: () => void;
  onRenombrado: (exerciseId: string, nombre: string, nombreCatalogo: string | null) => void;
}) {
  const [valor, setValor] = useState(ejercicio.nombre);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tieneAlias = Boolean(ejercicio.nombreCatalogo);
  const nombreCatalogo = ejercicio.nombreCatalogo ?? ejercicio.nombre;
  const recortado = valor.trim();
  const invalido =
    recortado.length === 0 || recortado.length > MAX_ALIAS || recortado === ejercicio.nombre;
  const rutaAlias = `exercises/${ejercicio.exerciseId}/alias`;

  async function ejecutar(accion: () => Promise<EjercicioResuelto>) {
    setGuardando(true);
    setError(null);
    try {
      const resuelto = await accion();
      onRenombrado(ejercicio.exerciseId, resuelto.nombre, resuelto.nombreCatalogo ?? null);
    } catch (err) {
      setError(err instanceof BrowserApiError ? err.message : 'No se pudo guardar el nombre.');
      setGuardando(false);
    }
  }

  const guardar = () =>
    ejecutar(() =>
      browserApiFetch<EjercicioResuelto>(rutaAlias, {
        method: 'PUT',
        body: JSON.stringify({ nombre: recortado }),
      }),
    );

  const volverAlOriginal = () =>
    ejecutar(() => browserApiFetch<EjercicioResuelto>(rutaAlias, { method: 'DELETE' }));

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto && !guardando) onCerrar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renombrar ejercicio</DialogTitle>
          <DialogDescription>
            Nombre del catálogo: {nombreCatalogo}. El nombre nuevo lo ven tus alumnos y vale en
            todas tus plantillas y rutinas.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="nombre-alias-ejercicio">Nombre</FieldLabel>
          <Input
            id="nombre-alias-ejercicio"
            value={valor}
            maxLength={MAX_ALIAS}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !invalido && !guardando) guardar();
            }}
          />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          {tieneAlias && (
            <Button type="button" variant="ghost" disabled={guardando} onClick={volverAlOriginal}>
              Volver al nombre original
            </Button>
          )}
          <Button type="button" variant="outline" disabled={guardando} onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="button" variant="brand" disabled={invalido || guardando} onClick={guardar}>
            {guardando && <Spinner data-icon="inline-start" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
