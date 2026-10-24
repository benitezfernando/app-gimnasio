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

/** Mismos endpoints que el Admin; el API deja al profesor actuar solo sobre alumnos de su cartera. */
async function cambiarEstadoDeAlumno(
  alumnoId: string,
  accion: 'deactivate' | 'reactivate',
  errorInesperado: string,
): Promise<{ error: string | null }> {
  try {
    await apiFetch(`/users/${alumnoId}/${accion}`, { method: 'PATCH' });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: errorInesperado };
  }
  revalidatePath('/profesor');
  return { error: null };
}

export async function deactivateAlumnoAction(alumnoId: string): Promise<{ error: string | null }> {
  return cambiarEstadoDeAlumno(alumnoId, 'deactivate', 'Error inesperado desactivando al alumno.');
}

export async function reactivateAlumnoAction(alumnoId: string): Promise<{ error: string | null }> {
  return cambiarEstadoDeAlumno(alumnoId, 'reactivate', 'Error inesperado reactivando al alumno.');
}

export async function deleteAlumnoPermanentlyAction(
  alumnoId: string,
): Promise<{ error: string | null; advertencia?: string }> {
  try {
    const resultado = await apiFetch<{ advertencia?: string }>(`/users/${alumnoId}/permanent`, {
      method: 'DELETE',
    });
    revalidatePath('/profesor');
    return { error: null, advertencia: resultado.advertencia };
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: 'Error inesperado eliminando al alumno.' };
  }
}
