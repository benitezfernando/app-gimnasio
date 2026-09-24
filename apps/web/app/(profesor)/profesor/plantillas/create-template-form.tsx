'use client';

import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { createTemplateAction, CreateTemplateActionState } from './actions';
import { PrimaryButton } from '../../../../components/ui/primary-button';

const ESTADO_INICIAL: CreateTemplateActionState = { error: null };

function BotonCrear() {
  const { pending } = useFormStatus();
  return (
    <PrimaryButton type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? 'Creando...' : 'Crear plantilla'}
    </PrimaryButton>
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
      <input
        name="nombre"
        placeholder="Nombre (ej. Full body)"
        required
        minLength={2}
        className="min-h-11 rounded-lg border border-border bg-background px-4 text-base text-foreground placeholder:text-muted-foreground lg:min-h-9 lg:text-sm"
      />
      <input
        name="descripcion"
        placeholder="Descripción (opcional)"
        className="min-h-11 rounded-lg border border-border bg-background px-4 text-base text-foreground placeholder:text-muted-foreground lg:min-h-9 lg:text-sm"
      />
      <BotonCrear />
      {estado.error && <p className="text-sm text-foreground">{estado.error}</p>}
    </form>
  );
}
