import { getUsersList } from '../../../lib/get-users-list';
import { CreateProfesorForm } from './create-profesor-form';
import { CreateAlumnoForm } from './create-alumno-form';
import { UsersList } from './users-list';

export default async function AdminPage() {
  // Memoizada por request (ver get-users-list.ts) — AdminLayout ya pidió
  // esta misma lista para el auth gate; esto reusa esa respuesta en vez
  // de pegarle a /users de nuevo.
  const usuarios = await getUsersList();

  return (
    <main className="min-h-dvh bg-surface-alt px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <h1 className="text-2xl font-semibold text-text">Panel Admin</h1>
        <div className="flex flex-col gap-6 sm:grid sm:grid-cols-2">
          <CreateProfesorForm />
          <CreateAlumnoForm />
        </div>
        <UsersList usuariosIniciales={usuarios} />
      </div>
    </main>
  );
}
