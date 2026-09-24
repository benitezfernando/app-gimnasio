'use client';

import { useEffect } from 'react';
import { PrimaryButton } from '../components/ui/primary-button';

/**
 * Error boundary de Next.js para todo lo que cuelga de este layout raíz.
 * Sin esto, cualquier excepción no controlada en un Server/Client
 * Component muestra la pantalla genérica "Application error: a
 * server-side exception has occurred" — indescifrable para un
 * profesor/alumno sin contexto técnico (nos pasó en producción más de
 * una vez). `reset()` reintenta el render del segmento sin recargar
 * toda la página.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <p className="text-xl font-semibold text-foreground">Algo salió mal</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Hubo un problema inesperado. Probá de nuevo — si sigue pasando, avisale a tu profesor o al
        administrador del gimnasio.
      </p>
      <PrimaryButton onClick={reset}>Reintentar</PrimaryButton>
    </main>
  );
}
