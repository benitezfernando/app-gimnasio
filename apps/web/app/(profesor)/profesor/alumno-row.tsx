'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useConfirm } from '@/components/confirm-dialog';
import { EditUserForm } from '../../../components/edit-user-form';
import { DeletePermanentlyDialog } from '../../../components/delete-permanently-dialog';
import {
  deactivateAlumnoAction,
  deleteAlumnoPermanentlyAction,
  editUserAction,
  reactivateAlumnoAction,
} from './actions';

interface AlumnoRow {
  id: string;
  nombre: string;
  username: string;
  activo: boolean;
}

export function AlumnoRow({ alumno }: { alumno: AlumnoRow }) {
  const confirmar = useConfirm();
  const [editando, setEditando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciarTransicion] = useTransition();

  async function desactivar() {
    const confirmado = await confirmar({
      titulo: `¿Desactivar a ${alumno.nombre}?`,
      descripcion:
        'No va a poder ingresar a la app. Si tiene otros profesores, tampoco van a poder trabajar con él. Podés reactivarlo cuando quieras.',
      confirmarLabel: 'Desactivar',
      destructiva: true,
    });
    if (confirmado) cambiarEstado(deactivateAlumnoAction);
  }

  function cambiarEstado(accion: typeof deactivateAlumnoAction) {
    setError(null);
    iniciarTransicion(async () => {
      const resultado = await accion(alumno.id);
      if (resultado.error) setError(resultado.error);
    });
  }

  return (
    <li data-guia="alumno-fila">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-2 gap-y-2 rounded-lg border border-border bg-background px-4 py-2">
        <Link href={`/profesor/alumnos/${alumno.id}`} className="min-w-0 flex-1 basis-40">
          <p className="text-sm font-medium text-foreground">{alumno.nombre}</p>
          <p className="text-xs text-muted-foreground">@{alumno.username}</p>
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {!alumno.activo && <Badge variant="secondary">Inactivo</Badge>}
          <Button variant="outline" size="sm" onClick={() => setEditando(!editando)}>
            Editar
          </Button>
          {alumno.activo ? (
            <Button
              variant="outline"
              size="sm"
              onClick={desactivar}
              disabled={pendiente}
              className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              Desactivar
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => cambiarEstado(reactivateAlumnoAction)}
              disabled={pendiente}
            >
              Reactivar
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEliminando(true)}
            disabled={alumno.activo || pendiente}
            title={alumno.activo ? 'Desactivalo primero' : undefined}
            className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            Eliminar
          </Button>
        </div>
      </div>
      {error && (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {editando && (
        <EditUserForm
          action={editUserAction.bind(null, alumno.id)}
          nombreActual={alumno.nombre}
          permitePassword={false}
          onCerrar={() => setEditando(false)}
        />
      )}
      {eliminando && (
        <DeletePermanentlyDialog
          userId={alumno.id}
          nombre={alumno.nombre}
          onEliminar={deleteAlumnoPermanentlyAction}
          onCerrado={() => setEliminando(false)}
        />
      )}
    </li>
  );
}
