'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createAdminAction, CreateAdminActionState } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';

const ESTADO_INICIAL: CreateAdminActionState = { error: null, success: false };

function BotonCrear() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="brand" disabled={pending}>
      {pending && <Spinner data-icon="inline-start" />}
      {pending ? 'Creando...' : 'Crear admin'}
    </Button>
  );
}

export function CreateAdminForm({ gymIdsExistentes }: { gymIdsExistentes: string[] }) {
  const [estado, formAction] = useActionState(createAdminAction, ESTADO_INICIAL);

  return (
    <section className="rounded-2xl bg-background p-4 shadow-xs sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-foreground">Nuevo admin</h2>
      <form action={formAction} className="flex flex-col gap-3">
        <Field>
          <FieldLabel htmlFor="crear-admin-gym-id" className="sr-only">
            gymId (nuevo o existente)
          </FieldLabel>
          <Input
            id="crear-admin-gym-id"
            name="gymId"
            placeholder="gymId (nuevo o existente)"
            required
            list="gym-ids-existentes"
          />
        </Field>
        <datalist id="gym-ids-existentes">
          {gymIdsExistentes.map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>
        <Field>
          <FieldLabel htmlFor="crear-admin-username" className="sr-only">
            Usuario
          </FieldLabel>
          <Input
            id="crear-admin-username"
            name="username"
            placeholder="Usuario"
            required
            minLength={3}
            autoCapitalize="none"
            autoCorrect="off"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="crear-admin-nombre" className="sr-only">
            Nombre
          </FieldLabel>
          <Input
            id="crear-admin-nombre"
            name="nombre"
            placeholder="Nombre"
            required
            minLength={2}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="crear-admin-password" className="sr-only">
            Contraseña
          </FieldLabel>
          <Input
            id="crear-admin-password"
            name="password"
            type="password"
            placeholder="Contraseña"
            required
            minLength={6}
          />
        </Field>
        <BotonCrear />
        {estado.error && (
          <Alert variant="destructive">
            <AlertDescription>{estado.error}</AlertDescription>
          </Alert>
        )}
        {estado.success && <p className="text-sm text-success">Admin creado.</p>}
      </form>
    </section>
  );
}
