'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { superAdminLoginAction, SuperAdminLoginActionState } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';

const ESTADO_INICIAL: SuperAdminLoginActionState = { error: null };

function BotonIngresar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="brand" disabled={pending} className="w-full">
      {pending && <Spinner data-icon="inline-start" />}
      {pending ? 'Ingresando...' : 'Ingresar'}
    </Button>
  );
}

export default function SuperAdminLoginPage() {
  const [estado, formAction] = useActionState(superAdminLoginAction, ESTADO_INICIAL);

  return (
    <main className="flex min-h-dvh flex-col justify-end bg-background px-6 pb-10 pt-8 lg:items-center lg:justify-center lg:px-4 lg:py-8">
      <div className="lg:w-full lg:max-w-sm lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:p-8">
        <h1 className="mb-6 text-2xl font-semibold text-gradient-brand lg:text-xl">Super Admin</h1>
        <form action={formAction} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="super-admin-login-username" className="sr-only">
              Usuario
            </FieldLabel>
            <Input
              id="super-admin-login-username"
              name="username"
              placeholder="Usuario"
              required
              autoCapitalize="none"
              autoCorrect="off"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="super-admin-login-password" className="sr-only">
              Contraseña
            </FieldLabel>
            <Input
              id="super-admin-login-password"
              name="password"
              type="password"
              placeholder="Contraseña"
              required
            />
          </Field>
          <BotonIngresar />
          {estado.error && (
            <Alert variant="destructive">
              <AlertDescription>{estado.error}</AlertDescription>
            </Alert>
          )}
        </form>
      </div>
    </main>
  );
}
