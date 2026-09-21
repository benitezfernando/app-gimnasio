'use server';

import { redirect } from 'next/navigation';
import { createWritableSupabaseServerClient } from '../../../lib/session-writable';

export interface SuperAdminLoginActionState {
  error: string | null;
}

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';

export async function superAdminLoginAction(
  _prevState: SuperAdminLoginActionState,
  formData: FormData,
): Promise<SuperAdminLoginActionState> {
  const username = String(formData.get('username') ?? '');
  const password = String(formData.get('password') ?? '');

  const response = await fetch(`${API_BASE_URL}/auth/super-admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    cache: 'no-store',
  });

  if (!response.ok) {
    return { error: 'Usuario o contraseña incorrectos.' };
  }

  const { accessToken, refreshToken } = await response.json();
  const supabase = await createWritableSupabaseServerClient();
  await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });

  redirect('/super-admin');
}
