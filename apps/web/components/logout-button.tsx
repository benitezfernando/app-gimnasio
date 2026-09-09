import { LogOut } from 'lucide-react';
import { logoutAction } from '../lib/logout-action';

/**
 * Form action plano — no necesita 'use client', un <form action={...}>
 * de Server Action funciona sin JS del lado del browser.
 */
export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        aria-label="Cerrar sesión"
        className="flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-text active:bg-surface-alt"
      >
        <LogOut size={18} />
        Cerrar sesión
      </button>
    </form>
  );
}
