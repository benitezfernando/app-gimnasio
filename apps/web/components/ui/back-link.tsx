import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/**
 * Variante de solo-Link del botón "Volver" de `PageHeader` — para
 * pantallas Server Component (sin 'use client') donde `router.back()`
 * no es una opción porque no se puede pasar una función por la frontera
 * Server→Client. Navega a un destino fijo (el padre lógico de la
 * pantalla) en vez de la historia del navegador.
 */
export function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      aria-label="Volver"
      className="flex h-11 w-11 items-center justify-center rounded-full text-foreground active:bg-card lg:h-9 lg:w-9"
    >
      <ArrowLeft size={22} aria-hidden />
    </Link>
  );
}
