'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { Dumbbell, LayoutGrid, Users, ClipboardList, LayoutDashboard } from 'lucide-react';
import { getActiveNavHref } from './bottom-nav-active';

export interface BottomNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// El alumno no ve el catálogo completo: solo los ejercicios de su rutina.
export const ALUMNO_NAV_ITEMS: BottomNavItem[] = [
  { href: '/alumno', label: 'Rutina', icon: Dumbbell },
];

export const PROFESOR_NAV_ITEMS: BottomNavItem[] = [
  { href: '/profesor', label: 'Cartera', icon: Users },
  { href: '/profesor/plantillas', label: 'Plantillas', icon: ClipboardList },
  { href: '/catalogo', label: 'Catálogo', icon: LayoutGrid },
];

export const ADMIN_NAV_ITEMS: BottomNavItem[] = [
  { href: '/admin', label: 'Panel', icon: LayoutDashboard },
  { href: '/catalogo', label: 'Catálogo', icon: LayoutGrid },
];

/**
 * Barra de navegación fija por rol — reemplaza el topbar de logout que
 * tenían los 4 layouts de route group. `usePathname()` obliga a que este
 * componente sea client-side; los layouts que lo montan siguen siendo
 * Server Components (RSC), montar un client component adentro no los
 * fuerza a serlo también.
 */
export function BottomNav({ items }: { items: BottomNavItem[] }) {
  const pathname = usePathname();
  const activeHref = getActiveNavHref(
    pathname,
    items.map((item) => item.href),
  );

  // El chequeo de lista vacía vive acá y no en AppShell: en el servidor
  // `items` (definido en este módulo 'use client') es una referencia de
  // cliente sin `length` real; recién en el cliente es el array.
  if (items.length === 0) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex min-h-16 items-center justify-around border-t border-border/60 bg-card/70 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] lg:hidden">
      {items.map((item) => {
        const activo = item.href === activeHref;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            data-guia={`nav-${item.href.split('/').pop()}`}
            aria-current={activo ? 'page' : undefined}
            className="flex min-w-11 flex-col items-center gap-1 px-3 py-1 transition-transform duration-150 active:scale-95"
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full ${
                activo ? 'bg-gradient-brand' : ''
              }`}
            >
              <Icon
                size={18}
                className={activo ? 'text-primary-foreground' : 'text-muted-foreground'}
                aria-hidden
              />
            </span>
            <span
              className={`text-xs font-medium ${activo ? 'text-primary-soft' : 'text-muted-foreground'}`}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
