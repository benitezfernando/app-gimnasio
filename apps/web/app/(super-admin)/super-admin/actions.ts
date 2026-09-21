'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from '../../../lib/api-client';

export interface CreateAdminActionState {
  error: string | null;
  success: boolean;
}

export async function createAdminAction(
  _prevState: CreateAdminActionState,
  formData: FormData,
): Promise<CreateAdminActionState> {
  const gymId = String(formData.get('gymId') ?? '');
  const username = String(formData.get('username') ?? '');
  const nombre = String(formData.get('nombre') ?? '');
  const password = String(formData.get('password') ?? '');

  try {
    await apiFetch('/super-admin/admins', {
      method: 'POST',
      body: JSON.stringify({ gymId, username, nombre, password }),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message, success: false };
    }
    return { error: 'Error inesperado creando el admin.', success: false };
  }

  revalidatePath('/super-admin');
  return { error: null, success: true };
}

export interface EditAdminActionState {
  error: string | null;
  success: boolean;
}

export async function editAdminAction(
  adminId: string,
  _prevState: EditAdminActionState,
  formData: FormData,
): Promise<EditAdminActionState> {
  const nombreRaw = formData.get('nombre');
  const passwordRaw = formData.get('password');
  const nombre = nombreRaw ? String(nombreRaw).trim() : undefined;
  const password = passwordRaw ? String(passwordRaw) : undefined;

  if (!nombre && !password) {
    return { error: 'Cambiá el nombre o la contraseña.', success: false };
  }

  try {
    await apiFetch(`/super-admin/admins/${adminId}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...(nombre ? { nombre } : {}), ...(password ? { password } : {}) }),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message, success: false };
    }
    return { error: 'Error inesperado editando el admin.', success: false };
  }

  revalidatePath('/super-admin');
  return { error: null, success: true };
}

export async function deactivateAdminAction(adminId: string): Promise<{ error: string | null }> {
  try {
    await apiFetch(`/super-admin/admins/${adminId}/deactivate`, { method: 'PATCH' });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: 'Error inesperado desactivando al admin.' };
  }

  revalidatePath('/super-admin');
  return { error: null };
}

export async function deleteAdminPermanentlyAction(
  adminId: string,
): Promise<{ error: string | null; advertencia?: string }> {
  try {
    const resultado = await apiFetch<{ advertencia?: string }>(
      `/super-admin/admins/${adminId}/permanent`,
      { method: 'DELETE' },
    );
    revalidatePath('/super-admin');
    return { error: null, advertencia: resultado.advertencia };
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: 'Error inesperado eliminando al admin.' };
  }
}
