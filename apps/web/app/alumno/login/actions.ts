'use server';

import { redirect } from 'next/navigation';
import { createWritableSupabaseServerClient } from '../../../lib/session-writable';
import { apiFetch } from '../../../lib/api-client';

export interface AlumnoLoginActionState {
  error: string | null;
}

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const ERROR_GENERICO = 'Usuario incorrecto.';

/** Sin `password`: el backend toma la rama de alumno (contraseña derivada). */
export async function alumnoLoginAction(
  _prevState: AlumnoLoginActionState,
  formData: FormData,
): Promise<AlumnoLoginActionState> {
  const gymId = String(formData.get('gymId') ?? '');
  const username = String(formData.get('username') ?? '');

  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gymId, username }),
    cache: 'no-store',
  });
  if (!response.ok) {
    return { error: ERROR_GENERICO };
  }

  const { accessToken, refreshToken } = await response.json();
  const supabase = await createWritableSupabaseServerClient();
  await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });

  const { role } = await apiFetch<{ role: string }>('/users/me');
  if (role !== 'ALUMNO') {
    await supabase.auth.signOut();
    return { error: ERROR_GENERICO };
  }

  redirect('/alumno');
}
