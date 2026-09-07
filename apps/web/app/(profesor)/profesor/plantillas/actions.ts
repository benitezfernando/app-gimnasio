'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from '../../../../lib/api-client';

export interface CreateTemplateActionState {
  error: string | null;
}

export async function createTemplateAction(
  _prevState: CreateTemplateActionState,
  formData: FormData,
): Promise<CreateTemplateActionState> {
  const nombre = String(formData.get('nombre') ?? '');
  const descripcion = String(formData.get('descripcion') ?? '');

  try {
    const creada = await apiFetch<{ id: string }>('/routine-templates', {
      method: 'POST',
      body: JSON.stringify({ nombre, descripcion: descripcion || undefined }),
    });
    revalidatePath('/profesor/plantillas');
    return {
      error: `Creada — abrila desde la lista para agregarle ejercicios (id: ${creada.id}).`,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: 'Error inesperado creando la plantilla.' };
  }
}

export async function toggleActivaAction(
  templateId: string,
  activa: boolean,
): Promise<{ error: string | null }> {
  try {
    await apiFetch(`/routine-templates/${templateId}`, {
      method: 'PATCH',
      body: JSON.stringify({ activa }),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: 'Error inesperado.' };
  }
  revalidatePath('/profesor/plantillas');
  return { error: null };
}

export async function deleteTemplateAction(templateId: string): Promise<{ error: string | null }> {
  try {
    await apiFetch(`/routine-templates/${templateId}`, { method: 'DELETE' });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: 'Error inesperado.' };
  }
  revalidatePath('/profesor/plantillas');
  return { error: null };
}
