'use client';

import { useState, useTransition } from 'react';
import { deactivateUserAction } from './actions';

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
  const [filtroRol, setFiltroRol] = useState<FiltroRol>('TODOS');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const usuariosFiltrados = usuariosIniciales.filter(
    (u) => filtroRol === 'TODOS' || u.role === filtroRol,
  );

  function handleDeactivate(userId: string, nombre: string) {
    const confirmado = window.confirm(
      `¿Desactivar a ${nombre}? Va a perder acceso inmediatamente. Esto no se puede deshacer desde acá.`,
    );
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
    return (
      <button
        onClick={() => handleDeactivate(u.id, u.nombre)}
        disabled={!u.activo || isPending}
        className={`min-h-11 rounded-lg border border-red-200 px-4 text-sm font-medium text-red-700 active:bg-red-50 disabled:border-neutral-200 disabled:text-neutral-400 ${className}`}
      >
        Desactivar
      </button>
    );
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">Usuarios del gym</h2>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          Filtrar por rol
          <select
            value={filtroRol}
            onChange={(e) => setFiltroRol(e.target.value as FiltroRol)}
            className="min-h-11 rounded-lg border border-neutral-300 px-3 text-base"
          >
            <option value="TODOS">Todos</option>
            <option value="ADMIN">Admin</option>
            <option value="PROFESOR">Profesor</option>
            <option value="ALUMNO">Alumno</option>
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* Mobile: tarjetas apiladas (default, sin prefijo — oculto desde md:) */}
      <ul className="flex flex-col gap-3 md:hidden">
        {usuariosFiltrados.map((u) => (
          <li key={u.id} className="rounded-xl border border-neutral-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-neutral-900">{u.nombre}</p>
                <p className="text-sm text-neutral-500">@{u.username}</p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  u.activo ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-500'
                }`}
              >
                {u.activo ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            <p className="mt-2 text-sm text-neutral-600">{ETIQUETA_ROL[u.role]}</p>
            <BotonDesactivar u={u} className="mt-3 w-full" />
          </li>
        ))}
      </ul>

      {/* md: en adelante — tabla, columnas más aprovechables en pantalla ancha */}
      <table className="hidden w-full text-left md:table">
        <thead>
          <tr className="border-b border-neutral-200 text-sm text-neutral-500">
            <th className="py-2 font-medium">Usuario</th>
            <th className="py-2 font-medium">Nombre</th>
            <th className="py-2 font-medium">Rol</th>
            <th className="py-2 font-medium">Estado</th>
            <th className="py-2 font-medium">Acción</th>
          </tr>
        </thead>
        <tbody>
          {usuariosFiltrados.map((u) => (
            <tr key={u.id} className="border-b border-neutral-100 last:border-0">
              <td className="py-3 text-sm text-neutral-500">@{u.username}</td>
              <td className="py-3 text-neutral-900">{u.nombre}</td>
              <td className="py-3 text-neutral-700">{ETIQUETA_ROL[u.role]}</td>
              <td className="py-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    u.activo ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-500'
                  }`}
                >
                  {u.activo ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td className="py-3">
                <BotonDesactivar u={u} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
