'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
      <div className="flex min-h-11 items-center justify-between rounded-lg border border-border bg-background px-4 py-2">
        <Link href={`/profesor/alumnos/${alumno.id}`} className="flex-1">
          <p className="text-sm font-medium text-foreground">{alumno.nombre}</p>
          <p className="text-xs text-muted-foreground">@{alumno.username}</p>
        </Link>
        <div className="flex items-center gap-2">
          {!alumno.activo && <Badge variant="secondary">Inactivo</Badge>}
          <Button variant="outline" size="sm" onClick={() => setEditando(!editando)}>
            Editar
          </Button>
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
