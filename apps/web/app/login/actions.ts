'use server';

import { redirect } from 'next/navigation';
import { createWritableSupabaseServerClient } from '../../lib/session-writable';
import { apiFetch } from '../../lib/api-client';

export interface LoginActionState {
  error: string | null;
}

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';

export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const gymId = String(formData.get('gymId') ?? '');
  const username = String(formData.get('username') ?? '');
  const passwordRaw = formData.get('password');
  const password = passwordRaw ? String(passwordRaw) : undefined;

  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gymId, username, ...(password ? { password } : {}) }),
    cache: 'no-store',
  });

  if (!response.ok) {
    return { error: 'Usuario o contraseña incorrectos.' };
  }

  const { accessToken, refreshToken } = await response.json();

  const supabase = createWritableSupabaseServerClient();
  await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });

  const { role } = await apiFetch<{ role: 'ADMIN' | 'PROFESOR' | 'ALUMNO' }>('/users/me');

  const destinoPorRole: Record<'ADMIN' | 'PROFESOR' | 'ALUMNO', string> = {
    ADMIN: '/admin',
    PROFESOR: '/profesor',
    ALUMNO: '/alumno',
  };

  redirect(destinoPorRole[role]);
}
