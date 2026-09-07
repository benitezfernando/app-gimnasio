'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createTemplateAction, CreateTemplateActionState } from './actions';

const ESTADO_INICIAL: CreateTemplateActionState = { error: null };

function BotonCrear() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 w-full rounded-lg bg-accent px-4 text-base font-medium text-accent-fg disabled:opacity-50 sm:w-auto"
    >
      {pending ? 'Creando...' : 'Crear plantilla'}
    </button>
  );
}

export function CreateTemplateForm() {
  const [estado, formAction] = useFormState(createTemplateAction, ESTADO_INICIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-text">Nueva plantilla</h2>
      <input
        name="nombre"
        placeholder="Nombre (ej. Full body)"
        required
        minLength={2}
        className="min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted"
      />
      <input
        name="descripcion"
        placeholder="Descripción (opcional)"
        className="min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted"
      />
      <BotonCrear />
      {estado.error && <p className="text-sm text-text">{estado.error}</p>}
    </form>
  );
}
