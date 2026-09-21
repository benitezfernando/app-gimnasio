'use client';

import { useState } from 'react';
import Link from 'next/link';
import { EditUserForm } from '../../../components/edit-user-form';
import { editUserAction } from './actions';

interface AlumnoRow {
  id: string;
  nombre: string;
  username: string;
  activo: boolean;
}

export function AlumnoRow({ alumno }: { alumno: AlumnoRow }) {
  const [editando, setEditando] = useState(false);

  return (
    <li>
      <div className="flex min-h-11 items-center justify-between rounded-lg border border-border bg-surface px-4 py-2">
        <Link href={`/profesor/alumnos/${alumno.id}`} className="flex-1">
          <p className="text-sm font-medium text-text">{alumno.nombre}</p>
          <p className="text-xs text-text-muted">@{alumno.username}</p>
        </Link>
        <div className="flex items-center gap-2">
          {!alumno.activo && (
            <span className="rounded-full bg-surface-alt px-2.5 py-1 text-xs font-medium text-text-muted">
              Inactivo
            </span>
          )}
          <button
            onClick={() => setEditando(!editando)}
            className="min-h-11 rounded-lg border border-border px-3 text-sm font-medium text-text lg:min-h-9"
          >
            Editar
          </button>
        </div>
      </div>
      {editando && (
        <EditUserForm
          action={editUserAction.bind(null, alumno.id)}
          nombreActual={alumno.nombre}
          permitePassword={false}
          onCerrar={() => setEditando(false)}
        />
      )}
    </li>
  );
}
