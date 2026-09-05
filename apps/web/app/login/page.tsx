'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { loginAction, LoginActionState } from './actions';

const ESTADO_INICIAL: LoginActionState = { error: null };
const GYM_ID = process.env.NEXT_PUBLIC_GYM_ID ?? '';

function BotonIngresar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 rounded-lg bg-neutral-900 px-4 text-base font-medium text-white active:bg-neutral-700 disabled:opacity-50"
    >
      {pending ? 'Ingresando...' : 'Ingresar'}
    </button>
  );
}

export default function LoginPage() {
  const [estado, formAction] = useFormState(loginAction, ESTADO_INICIAL);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-50 px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-2xl font-semibold text-neutral-900">Ingresar</h1>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="gymId" value={GYM_ID} />
          <input
            name="username"
            placeholder="Usuario"
            required
            className="min-h-11 rounded-lg border border-neutral-300 px-4 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
          />
          <input
            name="password"
            type="password"
            placeholder="Contraseña (dejalo vacío si sos alumno)"
            className="min-h-11 rounded-lg border border-neutral-300 px-4 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
          />
          <BotonIngresar />
          {estado.error && (
            <p role="alert" className="text-sm text-red-600">
              {estado.error}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
