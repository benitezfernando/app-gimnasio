'use server';

import { redirect } from 'next/navigation';
import { createWritableSupabaseServerClient } from './session-writable';
import { apiFetch } from './api-client';
import { loginDeRol, RolUsuario } from './login-routes';

async function loginDelUsuarioActual(): Promise<string> {
  try {
    const { role } = await apiFetch<{ role: RolUsuario }>('/users/me');
    return loginDeRol(role);
  } catch {
    return '/';
  }
}

/**
 * Invalida la sesión de Supabase (limpia la cookie httpOnly, mismo cliente
 * que escribe la sesión en el login) y redirige. Sin `redirectTo`, el
 * destino es el login del rol del usuario, resuelto ANTES de cerrar la
 * sesión (después ya no hay token para preguntar); si no se puede
 * resolver, `/`.
 */
export async function logoutAction(redirectTo?: string): Promise<void> {
  const destino = redirectTo ?? (await loginDelUsuarioActual());
  const supabase = await createWritableSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(destino);
}
