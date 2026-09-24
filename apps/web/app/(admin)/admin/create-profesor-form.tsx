'use client';

import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { createProfesorAction, CreateProfesorActionState } from './actions';
import { PrimaryButton } from '../../../components/ui/primary-button';

const ESTADO_INICIAL: CreateProfesorActionState = { error: null, success: false };

function BotonCrear() {
  const { pending } = useFormStatus();
  return (
    <PrimaryButton type="submit" disabled={pending} className="w-full active:opacity-90 sm:w-auto">
      {pending ? 'Creando...' : 'Crear profesor'}
    </PrimaryButton>
  );
}

const INPUT_CLASSES =
  'min-h-11 rounded-lg border border-border bg-background px-4 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden lg:min-h-9 lg:text-sm';

export function CreateProfesorForm() {
  const [estado, formAction] = useActionState(createProfesorAction, ESTADO_INICIAL);

  return (
    <section className="rounded-2xl bg-background p-4 shadow-xs sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-foreground">Nuevo profesor</h2>
      <form action={formAction} className="flex flex-col gap-3">
        <input
          name="username"
          placeholder="Usuario"
          required
          minLength={3}
          autoCapitalize="none"
          autoCorrect="off"
          className={INPUT_CLASSES}
        />
        <input
          name="nombre"
          placeholder="Nombre"
          required
          minLength={2}
          className={INPUT_CLASSES}
        />
        <input
          name="password"
          type="password"
          placeholder="Contraseña"
          required
          minLength={6}
          className={INPUT_CLASSES}
        />
        <BotonCrear />
        {estado.error && (
          <p role="alert" className="text-sm text-destructive">
            {estado.error}
          </p>
        )}
        {estado.success && <p className="text-sm text-success">Profesor creado.</p>}
      </form>
    </section>
  );
}
