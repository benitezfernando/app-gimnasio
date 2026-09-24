'use client';

import { useState, useTransition } from 'react';
import { deactivateUserAction, editUserAction } from './actions';
import { CarteraPanel } from './cartera-panel';
import { DeletePermanentlyDialog } from './delete-permanently-dialog';
import { EditUserForm } from '../../../components/edit-user-form';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useConfirm } from '@/components/confirm-dialog';

interface UserRow {
  id: string;
  username: string;
  nombre: string;
  role: 'ADMIN' | 'PROFESOR' | 'ALUMNO';
  activo: boolean;
}

type FiltroRol = 'TODOS' | UserRow['role'];

const ETIQUETA_ROL: Record<UserRow['role'], string> = {
  ADMIN: 'Admin',
  PROFESOR: 'Profesor',
  ALUMNO: 'Alumno',
};

export function UsersList({ usuariosIniciales }: { usuariosIniciales: UserRow[] }) {
  const confirmar = useConfirm();
  const [filtroRol, setFiltroRol] = useState<FiltroRol>('TODOS');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [usuarioAEliminar, setUsuarioAEliminar] = useState<UserRow | null>(null);
  const [usuarioAEditar, setUsuarioAEditar] = useState<UserRow | null>(null);

  const usuariosFiltrados = usuariosIniciales.filter(
    (u) => filtroRol === 'TODOS' || u.role === filtroRol,
  );
  const profesoresDelGym = usuariosIniciales.filter((u) => u.role === 'PROFESOR' && u.activo);

  async function handleDeactivate(userId: string, nombre: string) {
    const confirmado = await confirmar({
      titulo: `¿Desactivar a ${nombre}?`,
      descripcion: 'Va a perder acceso inmediatamente. Esto no se puede deshacer desde acá.',
      confirmarLabel: 'Desactivar',
      destructiva: true,
    });
    if (!confirmado) return;

    setError(null);
    startTransition(async () => {
      const resultado = await deactivateUserAction(userId);
      if (resultado.error) {
        setError(resultado.error);
      }
    });
  }

  function BotonDesactivar({ u, className = '' }: { u: UserRow; className?: string }) {
    const esAdmin = u.role === 'ADMIN';
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleDeactivate(u.id, u.nombre)}
        disabled={esAdmin || !u.activo || isPending}
        title={esAdmin ? 'Un ADMIN no se puede desactivar ni eliminar por esta vía' : undefined}
        className={`border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive ${className}`}
      >
        Desactivar
      </Button>
    );
  }

  function BotonEliminar({ u, className = '' }: { u: UserRow; className?: string }) {
    const esAdmin = u.role === 'ADMIN';
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setUsuarioAEliminar(u)}
        disabled={esAdmin || u.activo}
        title={
          esAdmin
            ? 'Un ADMIN no se puede desactivar ni eliminar por esta vía'
            : u.activo
              ? 'Desactivalo primero'
              : undefined
        }
        className={`border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive ${className}`}
      >
        Eliminar
      </Button>
    );
  }

  function BotonEditar({ u, className = '' }: { u: UserRow; className?: string }) {
    if (u.role === 'ADMIN') return null;
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setUsuarioAEditar(usuarioAEditar?.id === u.id ? null : u)}
        className={className}
      >
        Editar
      </Button>
    );
  }

  function EstadoBadge({ activo }: { activo: boolean }) {
    return (
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
          activo ? 'bg-success/15 text-success' : 'bg-card text-muted-foreground'
        }`}
      >
        {activo ? 'Activo' : 'Inactivo'}
      </span>
    );
  }

  return (
    <section className="rounded-2xl bg-background p-4 shadow-xs sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-foreground">Usuarios del gym</h2>
        <div className="flex items-center gap-2">
          <Label htmlFor="filtro-rol" className="text-sm">
            Filtrar por rol
          </Label>
          <NativeSelect
            id="filtro-rol"
            value={filtroRol}
            onChange={(e) => setFiltroRol(e.target.value as FiltroRol)}
          >
            <NativeSelectOption value="TODOS">Todos</NativeSelectOption>
            <NativeSelectOption value="ADMIN">Admin</NativeSelectOption>
            <NativeSelectOption value="PROFESOR">Profesor</NativeSelectOption>
            <NativeSelectOption value="ALUMNO">Alumno</NativeSelectOption>
          </NativeSelect>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Mobile: tarjetas apiladas (default, sin prefijo — oculto desde md:) */}
      <ul className="flex flex-col gap-3 md:hidden">
        {usuariosFiltrados.map((u) => (
          <li key={u.id} className="rounded-xl border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-foreground">{u.nombre}</p>
                <p className="text-sm text-muted-foreground">@{u.username}</p>
              </div>
              <EstadoBadge activo={u.activo} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{ETIQUETA_ROL[u.role]}</p>
            {u.role === 'ALUMNO' && <CarteraPanel alumno={u} profesoresDelGym={profesoresDelGym} />}
            <div className="mt-3 flex gap-2">
              <BotonEditar u={u} className="flex-1" />
              <BotonDesactivar u={u} className="flex-1" />
              <BotonEliminar u={u} className="flex-1" />
            </div>
            {usuarioAEditar?.id === u.id && (
              <EditUserForm
                action={editUserAction.bind(null, u.id)}
                nombreActual={u.nombre}
                permitePassword={u.role === 'PROFESOR'}
                onCerrar={() => setUsuarioAEditar(null)}
              />
            )}
          </li>
        ))}
      </ul>

      {/* md: en adelante — tabla, columnas más aprovechables en pantalla ancha */}
      <table className="hidden w-full text-left md:table">
        <thead>
          <tr className="border-b border-border text-sm text-muted-foreground">
            <th className="py-2 font-medium">Usuario</th>
            <th className="py-2 font-medium">Nombre</th>
            <th className="py-2 font-medium">Rol</th>
            <th className="py-2 font-medium">Estado</th>
            <th className="py-2 font-medium">Cartera</th>
            <th className="py-2 font-medium">Acción</th>
          </tr>
        </thead>
        <tbody>
          {usuariosFiltrados.map((u) => (
            <tr key={u.id} className="border-b border-border last:border-0">
              <td className="py-3 text-sm text-muted-foreground">@{u.username}</td>
              <td className="py-3 text-foreground">{u.nombre}</td>
              <td className="py-3 text-foreground">{ETIQUETA_ROL[u.role]}</td>
              <td className="py-3">
                <EstadoBadge activo={u.activo} />
              </td>
              <td className="py-3">
                {u.role === 'ALUMNO' ? (
                  <CarteraPanel alumno={u} profesoresDelGym={profesoresDelGym} />
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </td>
              <td className="py-3">
                <div className="flex gap-2">
                  <BotonEditar u={u} />
                  <BotonDesactivar u={u} />
                  <BotonEliminar u={u} />
                </div>
                {usuarioAEditar?.id === u.id && (
                  <EditUserForm
                    action={editUserAction.bind(null, u.id)}
                    nombreActual={u.nombre}
                    permitePassword={u.role === 'PROFESOR'}
                    onCerrar={() => setUsuarioAEditar(null)}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {usuarioAEliminar && (
        <DeletePermanentlyDialog
          userId={usuarioAEliminar.id}
          nombre={usuarioAEliminar.nombre}
          onCerrado={() => setUsuarioAEliminar(null)}
        />
      )}
    </section>
  );
}
