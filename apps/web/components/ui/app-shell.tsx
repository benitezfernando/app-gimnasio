// apps/web/components/ui/app-shell.tsx
import type { ReactNode } from 'react';
import type { BottomNavItem } from './bottom-nav';
import { BottomNav } from './bottom-nav';
import { Sidebar } from './sidebar';
import type { CurrentUser } from '../../lib/get-current-user';

/**
 * Compone la nav completa (Sidebar en desktop, BottomNav en mobile) y el
 * padding-left del contenido para que no quede tapado por el sidebar
 * fijo (`lg:pl-64`, mismo ancho que `Sidebar`). Centraliza acá el
 * patrón que antes se repetía en los 5 layouts de route group.
 */
export function AppShell({
  items,
  user,
  logoutRedirectTo,
  children,
}: {
  items: BottomNavItem[];
  user: CurrentUser;
  logoutRedirectTo?: string;
  children: ReactNode;
}) {
  return (
    <>
      <Sidebar items={items} user={user} logoutRedirectTo={logoutRedirectTo} />
      <div className="lg:pl-64">{children}</div>
      <BottomNav items={items} />
    </>
  );
}
