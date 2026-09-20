'use client';

import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { createAlumnoAction, CreateAlumnoActionState } from './actions';
import { PrimaryButton } from '../../../components/ui/primary-button';

const ESTADO_INICIAL: CreateAlumnoActionState = { error: null, usernameGenerado: null };

function BotonCrear() {
  const { pending } = useFormStatus();
  return (
    <PrimaryButton type="submit" disabled={pending} size="sm">
      {pending ? 'Creando...' : 'Crear alumno'}
    </PrimaryButton>
  );
}

export function CreateAlumnoForm() {
  const [estado, formAction] = useActionState(createAlumnoAction, ESTADO_INICIAL);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <form action={formAction} className="flex flex-col gap-2">
        <input
          name="nombre"
          placeholder="Nombre"
          required
          minLength={2}
          className="min-h-11 rounded-lg border border-border bg-surface px-3 text-text placeholder:text-text-muted lg:min-h-9"
        />
        <input
          name="apellido"
          placeholder="Apellido"
          required
          minLength={2}
          className="min-h-11 rounded-lg border border-border bg-surface px-3 text-text placeholder:text-text-muted lg:min-h-9"
        />
        <BotonCrear />
      </form>
      {estado.error && (
        <p role="alert" className="text-sm text-danger">
          {estado.error}
        </p>
      )}
      {estado.usernameGenerado && (
        <p className="rounded-lg bg-success/10 p-3 text-sm text-success">
          Alumno creado: <strong className="font-semibold">{estado.usernameGenerado}</strong> —
          comunicáselo en persona (es lo único que necesita para entrar).
        </p>
      )}
    </div>
  );
}
