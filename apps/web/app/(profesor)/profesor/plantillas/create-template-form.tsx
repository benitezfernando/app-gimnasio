'use client';

import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { createTemplateAction, CreateTemplateActionState } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';

const ESTADO_INICIAL: CreateTemplateActionState = { error: null };

function BotonCrear() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="brand" disabled={pending} className="w-full sm:w-auto">
      {pending && <Spinner data-icon="inline-start" />}
      {pending ? 'Creando...' : 'Crear plantilla'}
    </Button>
  );
}

export function CreateTemplateForm() {
  const [estado, formAction] = useActionState(createTemplateAction, ESTADO_INICIAL);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-2xl bg-background p-4 shadow-xs"
    >
      <h2 className="text-lg font-semibold text-foreground">Nueva plantilla</h2>
      <Field>
        <FieldLabel htmlFor="crear-plantilla-nombre" className="sr-only">
          Nombre (ej. Full body)
        </FieldLabel>
        <Input
          id="crear-plantilla-nombre"
          name="nombre"
          placeholder="Nombre (ej. Full body)"
          required
          minLength={2}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="crear-plantilla-descripcion" className="sr-only">
          Descripción (opcional)
        </FieldLabel>
        <Input
          id="crear-plantilla-descripcion"
          name="descripcion"
          placeholder="Descripción (opcional)"
        />
      </Field>
      <BotonCrear />
      {estado.error && <p className="text-sm text-foreground">{estado.error}</p>}
    </form>
  );
}
