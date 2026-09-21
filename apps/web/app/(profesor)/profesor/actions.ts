'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from '../../../lib/api-client';

export interface CreateAlumnoActionState {
  error: string | null;
  usernameGenerado: string | null;
}

/**
 * `POST /users/alumno` acepta ADMIN y PROFESOR (ver `CreateUserUseCase`) —
 * cuando lo invoca un PROFESOR, el alumno queda automáticamente en su
 * cartera (HU-02), sin paso adicional de asignación.
 */
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
    revalidatePath('/profesor');
    return { error: null, usernameGenerado: creado.username };
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message, usernameGenerado: null };
    }
    return { error: 'Error inesperado creando el alumno.', usernameGenerado: null };
  }
}

export interface EditUserActionState {
  error: string | null;
  success: boolean;
}

export async function editUserAction(
  userId: string,
  _prevState: EditUserActionState,
  formData: FormData,
): Promise<EditUserActionState> {
  const nombreRaw = formData.get('nombre');
  const passwordRaw = formData.get('password');
  const nombre = nombreRaw ? String(nombreRaw).trim() : undefined;
  const password = passwordRaw ? String(passwordRaw) : undefined;

  if (!nombre && !password) {
    return { error: 'Cambiá el nombre o la contraseña.', success: false };
  }

  try {
    await apiFetch(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...(nombre ? { nombre } : {}), ...(password ? { password } : {}) }),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message, success: false };
    }
    return { error: 'Error inesperado editando el usuario.', success: false };
  }

  revalidatePath('/profesor');
  return { error: null, success: true };
}
