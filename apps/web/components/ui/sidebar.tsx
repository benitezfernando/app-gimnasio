// apps/web/components/ui/sidebar.tsx
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import type { BottomNavItem } from './bottom-nav';
import { getActiveNavHref } from './bottom-nav-active';
import { inicialDe } from './avatar-initial';
import { LogoutButton } from '../logout-button';
import type { CurrentUser, Role } from '../../lib/get-current-user';
import logoGimnasio from '../../../../logo/mix-entrenamiento.png';

const ETIQUETA_ROL: Record<Role, string> = {
  ADMIN: 'Admin',
  PROFESOR: 'Profesor',
  ALUMNO: 'Alumno',
  SUPER_ADMIN: 'Súper Admin',
};

/**
 * Panel lateral fijo, solo desktop (`lg+`) — `hidden lg:flex`. Geometría
 * de columna completa (bloque de usuario arriba, nav al medio, logout
 * abajo) demasiado distinta de la barra inferior de mobile como para
 * compartir JSX con `BottomNav`; comparten datos (`items`,
 * `getActiveNavHref`), no markup.
 */
export function Sidebar({
  items,
  user,
  logoutRedirectTo,
}: {
  items: BottomNavItem[];
  user: CurrentUser;
  logoutRedirectTo?: string;
}) {
  const pathname = usePathname();
  const activeHref = getActiveNavHref(
    pathname,
    items.map((item) => item.href),
  );

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-border/60 bg-card/60 backdrop-blur-xl lg:flex">
      <div className="flex justify-center px-5 pb-2 pt-6">
        <div className="h-[72px] w-[72px] overflow-hidden rounded-full bg-card">
          <Image
            src={logoGimnasio}
            alt="Gimnasio Mix"
            sizes="72px"
            className="h-full w-full object-cover"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 border-b border-border/60 px-5 py-5">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-sm font-semibold text-primary-foreground"
        >
          {inicialDe(user.nombre)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{user.nombre}</p>
          <p className="truncate text-xs text-muted-foreground">{ETIQUETA_ROL[user.role]}</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {items.map((item) => {
          const activo = item.href === activeHref;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-guia={`nav-${item.href.split('/').pop()}`}
              aria-current={activo ? 'page' : undefined}
              className={`group flex items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 transition-colors duration-200 ${
                activo
                  ? 'border-primary bg-primary/12 text-primary-soft'
                  : 'border-transparent text-muted-foreground hover:bg-accent/50'
              }`}
            >
              <Icon
                size={18}
                className="shrink-0 transition-transform duration-200 group-hover:scale-105"
                aria-hidden
              />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center justify-between border-t border-border/60 px-3 py-3">
        <span aria-hidden className="text-xs text-muted-foreground">
          Cerrar sesión
        </span>
        <LogoutButton redirectTo={logoutRedirectTo} />
      </div>
    </aside>
  );
}
