import type { ReactNode } from 'react';

// Layout compartido del route group (alumno) — punto de extensión para el
// guard de rol ALUMNO en Fase 1 (HLD §4). Por ahora solo pasa los children.
export default function AlumnoLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
