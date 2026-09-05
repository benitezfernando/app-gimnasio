'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from '../../../lib/api-client';

export interface CreateProfesorActionState {
  error: string | null;
  success: boolean;
}

export async function createProfesorAction(
  _prevState: CreateProfesorActionState,
  formData: FormData,
): Promise<CreateProfesorActionState> {
  const username = String(formData.get('username') ?? '');
  const nombre = String(formData.get('nombre') ?? '');
  const password = String(formData.get('password') ?? '');

  try {
    await apiFetch('/users/profesor', {
      method: 'POST',
      body: JSON.stringify({ username, nombre, password }),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 409) {
        return {
          error: `Ya existe un usuario con el username '${username}' en este gym.`,
          success: false,
        };
      }
      return { error: error.message, success: false };
    }
    return { error: 'Error inesperado creando el profesor.', success: false };
  }

  revalidatePath('/admin');
  return { error: null, success: true };
}

export interface CreateAlumnoActionState {
  error: string | null;
  usernameGenerado: string | null;
}

export async function createAlumnoAction(
  _prevState: CreateAlumnoActionState,
  formData: FormData,
): Promise<CreateAlumnoActionState> {
  const nombre = String(formData.get('nombre') ?? '');
  const apellido = String(formData.get('apellido') ?? '');

  try {
    const creado = await apiFetch<{ username: string }>('/users/alumno', {
      method: 'POST',
      body: JSON.stringify({ nombre, apellido }),
    });
    revalidatePath('/admin');
    return { error: null, usernameGenerado: creado.username };
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message, usernameGenerado: null };
    }
    return { error: 'Error inesperado creando el alumno.', usernameGenerado: null };
  }
}

export async function deactivateUserAction(userId: string): Promise<{ error: string | null }> {
  try {
    await apiFetch(`/users/${userId}/deactivate`, { method: 'PATCH' });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: 'Error inesperado desactivando al usuario.' };
  }

  revalidatePath('/admin');
  return { error: null };
}
