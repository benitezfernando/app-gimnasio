import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Variante de solo-Link del botón "Volver" de `PageHeader` — para
 * pantallas Server Component (sin 'use client') donde `router.back()`
 * no es una opción porque no se puede pasar una función por la frontera
 * Server→Client. Navega a un destino fijo (el padre lógico de la
 * pantalla) en vez de la historia del navegador.
 */
export function BackLink({ href }: { href: string }) {
  return (
    <Button asChild variant="ghost" size="icon" className="rounded-full">
      <Link href={href} aria-label="Volver">
        <ArrowLeft size={22} aria-hidden />
      </Link>
    </Button>
  );
}
