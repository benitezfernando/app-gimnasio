'use client';

import { useEffect } from 'react';

/**
 * Red de seguridad para errores en el layout raíz mismo (fuera del
 * alcance de `error.tsx`, que no cubre `layout.tsx`). Reemplaza TODO
 * el `<html>` — Next.js lo exige acá porque el layout que falló ya no
 * está disponible para renderizar alrededor.
 */
export default function GlobalError({
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
    <html lang="es">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#0D0D14] px-6 text-center text-white">
        <p className="text-xl font-semibold">Algo salió mal</p>
        <p className="max-w-sm text-sm text-white/70">
          Hubo un problema inesperado. Probá de nuevo — si sigue pasando, avisale a tu profesor o al
          administrador del gimnasio.
        </p>
        <button
          onClick={reset}
          className="min-h-11 rounded-xl px-6 text-sm font-medium text-white"
          style={{ backgroundImage: 'linear-gradient(135deg, #8457E9, #C026D3, #3B82F6)' }}
        >
          Reintentar
        </button>
      </body>
    </html>
  );
}
