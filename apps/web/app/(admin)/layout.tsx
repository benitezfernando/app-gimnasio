import type { ReactNode } from 'react';

// Layout compartido del route group (admin) — punto de extensión para el
// guard de rol ADMIN en Fase 1 (HLD §4). Por ahora solo pasa los children.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
