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
        className="flex h-11 w-11 items-center justify-center rounded-full text-text active:bg-surface-alt lg:h-9 lg:w-9"
      >
        <LogOut size={20} aria-hidden />
      </button>
    </form>
  );
}
