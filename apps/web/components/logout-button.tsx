import { LogOut } from 'lucide-react';
import { logoutAction } from '../lib/logout-action';
import { Button } from '@/components/ui/button';

/**
 * Form action plano — no necesita 'use client', un <form action={...}>
 * de Server Action funciona sin JS del lado del browser. Sin
 * `redirectTo`, `logoutAction` manda al login del rol del usuario.
 */
export function LogoutButton({ redirectTo }: { redirectTo?: string }) {
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
