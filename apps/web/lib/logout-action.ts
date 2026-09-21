'use server';

import { redirect } from 'next/navigation';
import { createWritableSupabaseServerClient } from './session-writable';

/**
 * Invalida la sesión de Supabase (limpia la cookie httpOnly, mismo cliente
 * que escribe la sesión en el login) y redirige a `redirectTo` (default
 * `/login`). Sin lógica de rol — es la misma acción para
 * ADMIN/PROFESOR/ALUMNO/SUPER_ADMIN; el destino post-logout lo decide el
 * caller (SUPER_ADMIN vuelve a `/super-admin/login`).
 */
export async function logoutAction(redirectTo: string = '/login'): Promise<void> {
  const supabase = await createWritableSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(redirectTo);
}
