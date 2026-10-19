'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * "Volver" con `router.back()` para pantallas Server Component a las que
 * se llega desde más de un lugar (ej. el detalle del ejercicio, desde el
 * catálogo o desde la rutina del alumno). Si el destino es fijo, usar
 * `BackLink`.
 */
export function BackButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-full"
      type="button"
      onClick={() => router.back()}
      aria-label="Volver"
    >
      <ArrowLeft size={22} aria-hidden />
    </Button>
  );
}
