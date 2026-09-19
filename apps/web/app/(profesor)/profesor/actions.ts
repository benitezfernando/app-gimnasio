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
