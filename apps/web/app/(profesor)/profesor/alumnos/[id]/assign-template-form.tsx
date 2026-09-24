'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserApiFetch, BrowserApiError } from '../../../../../lib/browser-api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useConfirm } from '@/components/confirm-dialog';

interface TemplateOption {
  id: string;
  nombre: string;
  activa: boolean;
}

export function AssignTemplateForm({
  alumnoId,
  plantillas,
  reemplazaRutinaVigente = false,
}: {
  alumnoId: string;
  plantillas: TemplateOption[];
  reemplazaRutinaVigente?: boolean;
}) {
  const router = useRouter();
  const confirmar = useConfirm();
  const [templateId, setTemplateId] = useState('');
  const [nombre, setNombre] = useState('');
  const [vincular, setVincular] = useState(false);
  const [asignando, setAsignando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plantillasActivas = plantillas.filter((p) => p.activa);

  async function asignar() {
    if (!templateId) return;
    if (
      reemplazaRutinaVigente &&
      !(await confirmar({
        titulo: '¿Reemplazar la rutina actual?',
        descripcion: 'Esto reemplaza la rutina actual del alumno por la plantilla elegida.',
        confirmarLabel: 'Reemplazar',
      }))
    ) {
      return;
    }
    setAsignando(true);
    setError(null);
    try {
      await browserApiFetch('routine-instances', {
        method: 'POST',
        body: JSON.stringify({
          alumnoId,
          nombre: nombre.trim() || undefined,
          origenTemplateId: templateId,
          vincular,
        }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof BrowserApiError ? err.message : 'No se pudo asignar.');
    } finally {
      setAsignando(false);
    }
  }

  if (plantillasActivas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No tenés plantillas activas — armá una en{' '}
        <a href="/profesor/plantillas" className="text-primary-soft underline">
          Mis plantillas
        </a>{' '}
        primero, o armá la rutina desde cero más abajo.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
      <NativeSelect value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
        <NativeSelectOption value="">Elegir plantilla...</NativeSelectOption>
        {plantillasActivas.map((p) => (
          <NativeSelectOption key={p.id} value={p.id}>
            {p.nombre}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Field>
        <FieldLabel htmlFor="asignar-plantilla-nombre" className="sr-only">
          Nombre de la rutina
        </FieldLabel>
        <Input
          id="asignar-plantilla-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre de esta rutina para el alumno (opcional — copia el de la plantilla)"
        />
      </Field>
      <div className="flex items-center gap-2">
        <Checkbox
          id="asignar-plantilla-vincular"
          checked={vincular}
          onCheckedChange={(valor) => setVincular(valor === true)}
        />
        <Label htmlFor="asignar-plantilla-vincular" className="text-sm text-muted-foreground">
          Vincular a la plantilla (se actualiza sola si edito la plantilla después)
        </Label>
      </div>
      <Button
        type="button"
        variant="brand"
        size="sm"
        onClick={asignar}
        disabled={asignando || !templateId}
      >
        {asignando && <Spinner data-icon="inline-start" />}
        {asignando
          ? 'Asignando...'
          : reemplazaRutinaVigente
            ? 'Reemplazar rutina'
            : 'Asignar plantilla'}
      </Button>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
