'use client';

import { useState } from 'react';
import { EditUserForm } from '../../../components/edit-user-form';
import { editAdminAction } from './actions';

interface AdminRow {
  id: string;
  gymId: string | null;
  username: string;
  nombre: string;
  activo: boolean;
}

export function AdminsList({ admins }: { admins: AdminRow[] }) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const porGym = new Map<string, AdminRow[]>();
  for (const admin of admins) {
    const clave = admin.gymId ?? '(sin gym)';
    porGym.set(clave, [...(porGym.get(clave) ?? []), admin]);
  }

  return (
    <section className="rounded-2xl bg-surface p-4 shadow-sm sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-text">Admins por gym</h2>
      <div className="flex flex-col gap-4">
        {[...porGym.entries()].map(([gymId, filas]) => (
          <div key={gymId}>
            <p className="mb-2 text-sm font-medium text-text-muted">{gymId}</p>
            <ul className="flex flex-col gap-2">
              {filas.map((admin) => (
                <li key={admin.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-text">{admin.nombre}</p>
                      <p className="text-xs text-text-muted">@{admin.username}</p>
                    </div>
                    <button
                      onClick={() => setEditandoId(editandoId === admin.id ? null : admin.id)}
                      className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium text-text lg:min-h-9"
                    >
                      Editar
                    </button>
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
