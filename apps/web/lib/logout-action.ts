'use server';

import { redirect } from 'next/navigation';
import { createWritableSupabaseServerClient } from './session-writable';

/**
 * Invalida la sesión de Supabase (limpia la cookie httpOnly, mismo cliente
 * que escribe la sesión en el login) y redirige a /login. Sin lógica de
 * rol — es la misma acción para ADMIN/PROFESOR/ALUMNO.
 */
export async function logoutAction(): Promise<void> {
  const supabase = createWritableSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
