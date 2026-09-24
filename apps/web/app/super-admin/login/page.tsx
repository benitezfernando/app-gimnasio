'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { superAdminLoginAction, SuperAdminLoginActionState } from './actions';
import { PrimaryButton } from '../../../components/ui/primary-button';

const ESTADO_INICIAL: SuperAdminLoginActionState = { error: null };

function BotonIngresar() {
  const { pending } = useFormStatus();
  return (
    <PrimaryButton type="submit" disabled={pending} className="active:opacity-90">
      {pending ? 'Ingresando...' : 'Ingresar'}
    </PrimaryButton>
  );
}

export default function SuperAdminLoginPage() {
  const [estado, formAction] = useActionState(superAdminLoginAction, ESTADO_INICIAL);

  return (
    <main className="flex min-h-dvh flex-col justify-end bg-background px-6 pb-10 pt-8 lg:items-center lg:justify-center lg:px-4 lg:py-8">
      <div className="lg:w-full lg:max-w-sm lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:p-8">
        <h1 className="mb-6 text-2xl font-semibold text-foreground lg:text-xl">Super Admin</h1>
        <form action={formAction} className="flex flex-col gap-4">
          <input
            name="username"
            placeholder="Usuario"
            required
            autoCapitalize="none"
            autoCorrect="off"
            className="min-h-11 rounded-lg border border-border bg-background px-4 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden lg:min-h-9 lg:text-sm"
          />
          <input
            name="password"
            type="password"
            placeholder="Contraseña"
            required
            className="min-h-11 rounded-lg border border-border bg-background px-4 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden lg:min-h-9 lg:text-sm"
          />
          <BotonIngresar />
          {estado.error && (
            <p role="alert" className="text-sm text-destructive">
              {estado.error}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
