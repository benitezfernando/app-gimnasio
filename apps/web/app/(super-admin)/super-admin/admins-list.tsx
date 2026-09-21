'use client';

import { useState, useTransition } from 'react';
import { EditUserForm } from '../../../components/edit-user-form';
import { editAdminAction, deactivateAdminAction, deleteAdminPermanentlyAction } from './actions';

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

  const porGym = new Map<string, AdminRow[]>();
  for (const admin of admins) {
    const clave = admin.gymId ?? '(sin gym)';
    porGym.set(clave, [...(porGym.get(clave) ?? []), admin]);
  }

  function handleDesactivar(admin: AdminRow) {
    if (!window.confirm(`¿Desactivar a ${admin.nombre}? Pierde acceso inmediatamente.`)) return;
    setError(null);
    startTransition(async () => {
      const resultado = await deactivateAdminAction(admin.id);
      if (resultado.error) setError(resultado.error);
    });
  }

  function handleEliminar(admin: AdminRow) {
    if (!window.confirm(`¿Eliminar a ${admin.nombre} definitivamente? No se puede deshacer.`)) {
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
    <section className="rounded-2xl bg-surface p-4 shadow-sm sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-text">Admins por gym</h2>

      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-4">
        {[...porGym.entries()].map(([gymId, filas]) => (
          <div key={gymId}>
            <p className="mb-2 text-sm font-medium text-text-muted">{gymId}</p>
            <ul className="flex flex-col gap-2">
              {filas.map((admin) => (
                <li key={admin.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-text">{admin.nombre}</p>
                      <p className="text-xs text-text-muted">
                        @{admin.username} — {admin.activo ? 'Activo' : 'Inactivo'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditandoId(editandoId === admin.id ? null : admin.id)}
                        className="min-h-11 rounded-lg border border-border px-3 text-sm font-medium text-text lg:min-h-9"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDesactivar(admin)}
                        disabled={!admin.activo || isPending}
                        className="min-h-11 rounded-lg border border-danger/30 px-3 text-sm font-medium text-danger disabled:opacity-40 lg:min-h-9"
                      >
                        Desactivar
                      </button>
                      <button
                        onClick={() => handleEliminar(admin)}
                        disabled={admin.activo || isPending}
                        title={
                          admin.activo ? 'Desactivalo primero para poder eliminarlo' : undefined
                        }
                        className="min-h-11 rounded-lg border border-danger/30 px-3 text-sm font-medium text-danger disabled:opacity-40 lg:min-h-9"
                      >
                        Eliminar
                      </button>
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
        {admins.length === 0 && <p className="text-sm text-text-muted">Todavía no hay admins.</p>}
      </div>
    </section>
  );
}
