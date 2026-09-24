import { LogOut } from 'lucide-react';
import { logoutAction } from '../lib/logout-action';

/**
 * Form action plano — no necesita 'use client', un <form action={...}>
 * de Server Action funciona sin JS del lado del browser. `redirectTo`
 * opcional (default `/login`) para que SUPER_ADMIN vuelva a
 * `/super-admin/login` en vez del login de tenant.
 */
export function LogoutButton({ redirectTo = '/login' }: { redirectTo?: string }) {
  const accionConDestino = logoutAction.bind(null, redirectTo);
  return (
    <form action={accionConDestino}>
      <button
        type="submit"
        aria-label="Cerrar sesión"
        className="flex h-11 w-11 items-center justify-center rounded-full text-foreground active:bg-card lg:h-9 lg:w-9"
      >
        <LogOut size={20} aria-hidden />
      </button>
    </form>
  );
}
