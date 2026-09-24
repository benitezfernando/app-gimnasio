'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';

export interface EditUserActionState {
  error: string | null;
  success: boolean;
}

const ESTADO_INICIAL: EditUserActionState = { error: null, success: false };

function BotonGuardar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="brand" size="sm" disabled={pending}>
      {pending && <Spinner data-icon="inline-start" />}
      {pending ? 'Guardando...' : 'Guardar'}
    </Button>
  );
}

/**
 * Reusado por /admin (nombre + password si `permitePassword`) y
 * /profesor (solo nombre, `permitePassword={false}` — el backend
 * rechazaría igual una password para un ALUMNO, pero no tiene sentido
 * mostrar el campo).
 */
export function EditUserForm({
  action,
  nombreActual,
  permitePassword,
  onCerrar,
}: {
  action: (prevState: EditUserActionState, formData: FormData) => Promise<EditUserActionState>;
  nombreActual: string;
  permitePassword: boolean;
  onCerrar: () => void;
}) {
  const [estado, formAction] = useActionState(action, ESTADO_INICIAL);
  const [nombre, setNombre] = useState(nombreActual);

  return (
    <form
      action={formAction}
      className="mt-2 flex flex-col gap-2 rounded-lg border border-border p-3"
    >
      <Field>
        <FieldLabel htmlFor="editar-usuario-nombre" className="sr-only">
          Nombre
        </FieldLabel>
        <Input
          id="editar-usuario-nombre"
          name="nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre"
          minLength={2}
        />
      </Field>
      {permitePassword && (
        <Field>
          <FieldLabel htmlFor="editar-usuario-password" className="sr-only">
            Nueva contraseña (dejalo vacío para no cambiarla)
          </FieldLabel>
          <Input
            id="editar-usuario-password"
            name="password"
            type="password"
            placeholder="Nueva contraseña (dejalo vacío para no cambiarla)"
            minLength={6}
          />
        </Field>
      )}
      <div className="flex gap-2">
        <BotonGuardar />
        <Button type="button" variant="ghost" size="sm" onClick={onCerrar}>
          Cancelar
        </Button>
      </div>
      {estado.error && (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}
      {estado.success && <p className="text-sm text-success">Guardado.</p>}
    </form>
  );
}
