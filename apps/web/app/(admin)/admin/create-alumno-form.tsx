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
    <Button type="submit" variant="brand" disabled={pending} className="w-full sm:w-auto">
      {pending && <Spinner data-icon="inline-start" />}
      {pending ? 'Creando...' : 'Crear alumno'}
    </Button>
  );
}

export function CreateAlumnoForm() {
  const [estado, formAction] = useActionState(createAlumnoAction, ESTADO_INICIAL);

  return (
    <section className="rounded-2xl bg-background p-4 shadow-xs sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-foreground">Nuevo alumno</h2>
      <form action={formAction} className="flex flex-col gap-3">
        <Field>
          <FieldLabel htmlFor="admin-alumno-nombre" className="sr-only">
            Nombre
          </FieldLabel>
          <Input
            id="admin-alumno-nombre"
            name="nombre"
            placeholder="Nombre"
            required
            minLength={2}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="admin-alumno-apellido" className="sr-only">
            Apellido
          </FieldLabel>
          <Input
            id="admin-alumno-apellido"
            name="apellido"
            placeholder="Apellido"
            required
            minLength={2}
          />
        </Field>
        <BotonCrear />
        {estado.error && (
          <Alert variant="destructive">
            <AlertDescription>{estado.error}</AlertDescription>
          </Alert>
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
