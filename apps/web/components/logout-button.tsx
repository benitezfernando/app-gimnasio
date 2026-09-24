import { LogOut } from 'lucide-react';
import { logoutAction } from '../lib/logout-action';
import { Button } from '@/components/ui/button';

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
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full"
        type="submit"
        aria-label="Cerrar sesión"
      >
        <LogOut size={20} aria-hidden />
      </Button>
    </form>
  );
}
