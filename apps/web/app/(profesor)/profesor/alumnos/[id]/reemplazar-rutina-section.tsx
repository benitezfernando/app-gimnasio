'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewRoutineForm } from './new-routine-form';

interface TemplateOption {
  id: string;
  nombre: string;
}

/**
 * Colapsada por defecto cuando ya hay una rutina vigente — mostrar un
 * segundo editor completo (con su propio buscador, checkbox de vínculo y
 * botón de guardar) siempre abierto al lado de "Ajustar rutina" resultaba
 * confuso para el profesor. Sin rutina vigente no hay nada que colapsar:
 * arranca abierta.
 */
export function ReemplazarRutinaSection({
  alumnoId,
  plantillas,
  hayRutinaVigente,
}: {
  alumnoId: string;
  plantillas: TemplateOption[];
  hayRutinaVigente: boolean;
}) {
  const [abierto, setAbierto] = useState(!hayRutinaVigente);

  if (!abierto) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setAbierto(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        Armar una rutina nueva desde cero
      </Button>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          {hayRutinaVigente ? 'Reemplazar por una rutina nueva' : 'Armar rutina'}
        </h2>
        {hayRutinaVigente && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
        )}
      </div>
      {plantillas.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No tenés plantillas activas — podés armar la rutina desde cero o crear una en{' '}
          <a href="/profesor/plantillas" className="text-primary-soft underline">
            Mis plantillas
          </a>
          .
        </p>
      )}
      <NewRoutineForm
        alumnoId={alumnoId}
        plantillas={plantillas}
        reemplazaRutinaVigente={hayRutinaVigente}
      />
    </section>
  );
}
