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

export const ALUMNO_NAV_ITEMS: BottomNavItem[] = [
  { href: '/alumno', label: 'Rutina', icon: Dumbbell },
  { href: '/catalogo', label: 'Catálogo', icon: LayoutGrid },
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

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 flex h-16 items-center justify-around border-t border-border bg-surface-alt"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {items.map((item) => {
        const activo = item.href === activeHref;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-w-11 flex-col items-center gap-1 px-3 py-1"
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full ${
                activo ? 'bg-gradient-accent' : ''
              }`}
            >
              <Icon
                size={18}
                className={activo ? 'text-accent-fg' : 'text-text-muted'}
                aria-hidden
              />
            </span>
            <span
              className={`text-xs font-medium ${activo ? 'text-accent-text' : 'text-text-muted'}`}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
