'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createAlumnoAction, CreateAlumnoActionState } from './actions';

const ESTADO_INICIAL: CreateAlumnoActionState = { error: null, usernameGenerado: null };

function BotonCrear() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 w-full rounded-lg bg-accent px-4 text-base font-medium text-accent-fg active:opacity-90 disabled:opacity-50 sm:w-auto"
    >
      {pending ? 'Creando...' : 'Crear alumno'}
    </button>
  );
}

const INPUT_CLASSES =
  'min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted focus:border-accent focus:outline-none';

export function CreateAlumnoForm() {
  const [estado, formAction] = useFormState(createAlumnoAction, ESTADO_INICIAL);

  return (
    <section className="rounded-2xl bg-surface p-4 shadow-sm sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-text">Nuevo alumno</h2>
      <form action={formAction} className="flex flex-col gap-3">
        <input
          name="nombre"
          placeholder="Nombre"
          required
          minLength={2}
          className={INPUT_CLASSES}
        />
        <input
          name="apellido"
          placeholder="Apellido"
          required
          minLength={2}
          className={INPUT_CLASSES}
        />
        <BotonCrear />
        {estado.error && (
          <p role="alert" className="text-sm text-danger">
            {estado.error}
          </p>
        )}
        {estado.usernameGenerado && (
          <p className="rounded-lg bg-success/10 p-3 text-sm text-success">
            Usuario creado: <strong className="font-semibold">{estado.usernameGenerado}</strong> —
            comunicáselo en persona (es lo único que necesita para entrar).
          </p>
        )}
      </form>
    </section>
  );
}
