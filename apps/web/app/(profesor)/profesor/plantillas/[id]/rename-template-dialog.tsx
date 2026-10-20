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
import { renameTemplateAction } from '../actions';

// Mismo mínimo que al crear la plantilla (CreateRoutineTemplateDto).
const MIN_NOMBRE = 2;

/** El padre lo monta solo mientras está abierto, así que el estado inicial siempre es el nombre actual. */
export function RenameTemplateDialog({
  templateId,
  nombreActual,
  onCerrar,
  onRenombrada,
}: {
  templateId: string;
  nombreActual: string;
  onCerrar: () => void;
  onRenombrada: () => void;
}) {
  const [valor, setValor] = useState(nombreActual);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recortado = valor.trim();
  const invalido = recortado.length < MIN_NOMBRE || recortado === nombreActual;

  async function guardar() {
    setGuardando(true);
    setError(null);
    const resultado = await renameTemplateAction(templateId, recortado);
    if (resultado.error) {
      setError(resultado.error);
      setGuardando(false);
      return;
    }
    onRenombrada();
  }

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto && !guardando) onCerrar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renombrar plantilla</DialogTitle>
          <DialogDescription>
            Las rutinas de tus alumnos ya asignadas con esta plantilla conservan su nombre.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="nombre-plantilla">Nombre</FieldLabel>
          <Input
            id="nombre-plantilla"
            value={valor}
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
