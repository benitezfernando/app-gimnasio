import type { ReactNode } from 'react';

// Layout compartido del route group (profesor) — punto de extensión para el
// guard de rol PROFESOR en Fase 1 (HLD §4). Por ahora solo pasa los children.
export default function ProfesorLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
