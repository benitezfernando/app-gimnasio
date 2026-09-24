'use client';

import { useState, useTransition } from 'react';
import { ShieldUser } from 'lucide-react';
import { EditUserForm } from '../../../components/edit-user-form';
import { editAdminAction, deactivateAdminAction, deleteAdminPermanentlyAction } from './actions';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { useConfirm } from '@/components/confirm-dialog';

interface AdminRow {
  id: string;
  gymId: string | null;
  username: string;
  nombre: string;
  activo: boolean;
}

export function AdminsList({ admins }: { admins: AdminRow[] }) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmar = useConfirm();

  const porGym = new Map<string, AdminRow[]>();
  for (const admin of admins) {
    const clave = admin.gymId ?? '(sin gym)';
    porGym.set(clave, [...(porGym.get(clave) ?? []), admin]);
  }

  async function handleDesactivar(admin: AdminRow) {
    if (
      !(await confirmar({
        titulo: `¿Desactivar a ${admin.nombre}?`,
        descripcion: 'Pierde acceso inmediatamente.',
        confirmarLabel: 'Desactivar',
        destructiva: true,
      }))
    )
      return;
    setError(null);
    startTransition(async () => {
      const resultado = await deactivateAdminAction(admin.id);
      if (resultado.error) setError(resultado.error);
    });
  }

  async function handleEliminar(admin: AdminRow) {
    if (
      !(await confirmar({
        titulo: `¿Eliminar a ${admin.nombre} definitivamente?`,
        descripcion: 'No se puede deshacer.',
        confirmarLabel: 'Eliminar',
        destructiva: true,
      }))
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const resultado = await deleteAdminPermanentlyAction(admin.id);
      if (resultado.error) setError(resultado.error);
      else if (resultado.advertencia) setError(resultado.advertencia);
    });
  }

  return (
    <section className="rounded-2xl bg-background p-4 shadow-xs sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-foreground">Admins por gym</h2>

      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-4">
        {[...porGym.entries()].map(([gymId, filas]) => (
          <div key={gymId}>
            <p className="mb-2 text-sm font-medium text-muted-foreground">{gymId}</p>
            <ul className="flex flex-col gap-2">
              {filas.map((admin) => (
                <li key={admin.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">{admin.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        @{admin.username} — {admin.activo ? 'Activo' : 'Inactivo'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditandoId(editandoId === admin.id ? null : admin.id)}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleDesactivar(admin)}
                        disabled={!admin.activo || isPending}
                      >
                        Desactivar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleEliminar(admin)}
                        disabled={admin.activo || isPending}
                        title={
                          admin.activo ? 'Desactivalo primero para poder eliminarlo' : undefined
                        }
                      >
                        Eliminar
                      </Button>
                    </div>
                  </div>
                  {editandoId === admin.id && (
                    <EditUserForm
                      action={editAdminAction.bind(null, admin.id)}
                      nombreActual={admin.nombre}
                      permitePassword
                      onCerrar={() => setEditandoId(null)}
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {admins.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShieldUser />
              </EmptyMedia>
              <EmptyTitle>Todavía no hay admins</EmptyTitle>
              <EmptyDescription>Creá el primero con el formulario de arriba.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </section>
  );
}
