'use client';

import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { createAlumnoAction, CreateAlumnoActionState } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';

const ESTADO_INICIAL: CreateAlumnoActionState = { error: null, usernameGenerado: null };

function BotonCrear() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="brand" disabled={pending} size="sm">
      {pending && <Spinner data-icon="inline-start" />}
      {pending ? 'Creando...' : 'Crear alumno'}
    </Button>
  );
}

export function CreateAlumnoForm() {
  const [estado, formAction] = useActionState(createAlumnoAction, ESTADO_INICIAL);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
      <form action={formAction} className="flex flex-col gap-2">
        <Field>
          <FieldLabel htmlFor="crear-alumno-nombre" className="sr-only">
            Nombre
          </FieldLabel>
          <Input
            id="crear-alumno-nombre"
            name="nombre"
            placeholder="Nombre"
            required
            minLength={2}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="crear-alumno-apellido" className="sr-only">
            Apellido
          </FieldLabel>
          <Input
            id="crear-alumno-apellido"
            name="apellido"
            placeholder="Apellido"
            required
            minLength={2}
          />
        </Field>
        <BotonCrear />
      </form>
      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
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
