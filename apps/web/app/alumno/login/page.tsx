'use client';

import { Suspense, useActionState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { alumnoLoginAction, AlumnoLoginActionState } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import logoGimnasio from '../../../../../logo/mix-entrenamiento.png';

const ESTADO_INICIAL: AlumnoLoginActionState = { error: null };
const GYM_ID = process.env.NEXT_PUBLIC_GYM_ID ?? '';

function BotonIngresar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="brand" disabled={pending} className="w-full">
      {pending && <Spinner data-icon="inline-start" />}
      {pending ? 'Ingresando...' : 'Ingresar'}
    </Button>
  );
}

// useSearchParams() exige Suspense para no romper el prerender estático.
function AvisoSesionExpirada() {
  const searchParams = useSearchParams();
  if (searchParams.get('sessionExpired') !== '1') return null;
  return (
    <Alert className="mb-4">
      <AlertDescription>Tu sesión expiró. Ingresá de nuevo.</AlertDescription>
    </Alert>
  );
}

export default function AlumnoLoginPage() {
  const [estado, formAction] = useActionState(alumnoLoginAction, ESTADO_INICIAL);

  return (
    <main className="flex min-h-dvh flex-col justify-end bg-background px-6 pb-10 pt-8 lg:items-center lg:justify-center lg:px-4 lg:py-8">
      <div className="lg:w-full lg:max-w-sm lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:p-8">
        <div className="mb-6 flex justify-center">
          <div className="h-24 w-24 overflow-hidden rounded-full bg-card">
            <Image
              src={logoGimnasio}
              alt="Logo del gimnasio"
              className="h-full w-full object-cover"
              priority
            />
          </div>
        </div>
        <h1 className="mb-6 text-2xl font-semibold text-gradient-brand lg:text-xl">Ingresar</h1>
        <Suspense fallback={null}>
          <AvisoSesionExpirada />
        </Suspense>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="gymId" value={GYM_ID} />
          <Field>
            <FieldLabel htmlFor="alumno-login-username" className="sr-only">
              Usuario
            </FieldLabel>
            <Input
              id="alumno-login-username"
              name="username"
              placeholder="Usuario"
              required
              autoCapitalize="none"
              autoCorrect="off"
            />
          </Field>
          <BotonIngresar />
          {estado.error && (
            <Alert variant="destructive">
              <AlertDescription>{estado.error}</AlertDescription>
            </Alert>
          )}
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          ¿Sos profesor o admin?{' '}
          <Link href="/login" className="underline underline-offset-2 hover:text-foreground">
            Ingresá acá
          </Link>
        </p>
      </div>
    </main>
  );
}
