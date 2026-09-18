'use client';

import { Suspense } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { loginAction, LoginActionState } from './actions';
import { PrimaryButton } from '../../components/ui/primary-button';

const ESTADO_INICIAL: LoginActionState = { error: null };
const GYM_ID = process.env.NEXT_PUBLIC_GYM_ID ?? '';

function BotonIngresar() {
  const { pending } = useFormStatus();
  return (
    <PrimaryButton type="submit" disabled={pending} className="active:opacity-90">
      {pending ? 'Ingresando...' : 'Ingresar'}
    </PrimaryButton>
  );
}

// `useSearchParams()` opta la página a client-side rendering si no está
// envuelto en Suspense (Next.js lo exige para no romper el prerender
// estático) — separado en su propio componente por eso, no por estilo.
function AvisoSesionExpirada() {
  const searchParams = useSearchParams();
  const sesionExpirada = searchParams.get('sessionExpired') === '1';

  if (!sesionExpirada) {
    return null;
  }

  return (
    <p
      role="alert"
      className="mb-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text"
    >
      Tu sesión expiró. Ingresá de nuevo.
    </p>
  );
}

export default function LoginPage() {
  const [estado, formAction] = useFormState(loginAction, ESTADO_INICIAL);

  return (
    <main className="flex min-h-dvh flex-col justify-end bg-surface px-6 pb-10 pt-8">
      <h1 className="mb-6 text-2xl font-semibold text-text">Ingresar</h1>
      <Suspense fallback={null}>
        <AvisoSesionExpirada />
      </Suspense>
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="gymId" value={GYM_ID} />
        <input
          name="username"
          placeholder="Usuario"
          required
          className="min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted focus:border-accent focus:outline-none lg:min-h-9 lg:text-sm"
        />
        <input
          name="password"
          type="password"
          placeholder="Contraseña (dejalo vacío si sos alumno)"
          className="min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted focus:border-accent focus:outline-none lg:min-h-9 lg:text-sm"
        />
        <BotonIngresar />
        {estado.error && (
          <p role="alert" className="text-sm text-danger">
            {estado.error}
          </p>
        )}
      </form>
    </main>
  );
}
