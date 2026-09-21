'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { PrimaryButton } from './ui/primary-button';

export interface EditUserActionState {
  error: string | null;
  success: boolean;
}

const ESTADO_INICIAL: EditUserActionState = { error: null, success: false };

const INPUT_CLASSES =
  'min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted focus:border-accent focus:outline-none lg:min-h-9 lg:text-sm';

function BotonGuardar() {
  const { pending } = useFormStatus();
  return (
    <PrimaryButton type="submit" size="sm" disabled={pending}>
      {pending ? 'Guardando...' : 'Guardar'}
    </PrimaryButton>
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
      <input
        name="nombre"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre"
        minLength={2}
        className={INPUT_CLASSES}
      />
      {permitePassword && (
        <input
          name="password"
          type="password"
          placeholder="Nueva contraseña (dejalo vacío para no cambiarla)"
          minLength={6}
          className={INPUT_CLASSES}
        />
      )}
      <div className="flex gap-2">
        <BotonGuardar />
        <button
          type="button"
          onClick={onCerrar}
          className="min-h-11 rounded-lg border border-border px-4 text-sm text-text-muted lg:min-h-9"
        >
          Cancelar
        </button>
      </div>
      {estado.error && (
        <p role="alert" className="text-sm text-danger">
          {estado.error}
        </p>
      )}
      {estado.success && <p className="text-sm text-success">Guardado.</p>}
    </form>
  );
}
