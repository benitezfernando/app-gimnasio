import { apiFetch } from '../../../lib/api-client';
import { getCurrentUser } from '../../../lib/get-current-user';
import { homeDeRol } from '../../../lib/role-home';
import { CatalogoCliente } from './catalogo-cliente';
import { LIMITE_POR_PAGINA, ListExercisesResponse } from './catalogo-api';

/**
 * La primera página del catálogo se trae acá, en el servidor (al lado de
 * la API), en vez de esperar a que el navegador hidrate, aplique el
 * debounce y la pida por el proxy.
 */
export default async function CatalogoPage() {
  const [usuario, inicial] = await Promise.all([
    getCurrentUser(),
    apiFetch<ListExercisesResponse>(`/exercises?page=1&limit=${LIMITE_POR_PAGINA}`),
  ]);

  return <CatalogoCliente homeHref={homeDeRol(usuario.role)} inicial={inicial} />;
}
