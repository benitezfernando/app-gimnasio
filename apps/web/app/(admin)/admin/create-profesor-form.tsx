'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createProfesorAction, CreateProfesorActionState } from './actions';

const ESTADO_INICIAL: CreateProfesorActionState = { error: null, success: false };

function BotonCrear() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 w-full rounded-lg bg-accent px-4 text-base font-medium text-accent-fg active:opacity-90 disabled:opacity-50 sm:w-auto"
    >
      {pending ? 'Creando...' : 'Crear profesor'}
    </button>
  );
}

const INPUT_CLASSES =
  'min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted focus:border-accent focus:outline-none';

export function CreateProfesorForm() {
  const [estado, formAction] = useFormState(createProfesorAction, ESTADO_INICIAL);

  return (
    <section className="rounded-2xl bg-surface p-4 shadow-sm sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-text">Nuevo profesor</h2>
      <form action={formAction} className="flex flex-col gap-3">
        <input
          name="username"
          placeholder="Usuario"
          required
          minLength={3}
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
          <p role="alert" className="text-sm text-danger">
            {estado.error}
          </p>
        )}
        {estado.success && <p className="text-sm text-success">Profesor creado.</p>}
      </form>
    </section>
  );
}
