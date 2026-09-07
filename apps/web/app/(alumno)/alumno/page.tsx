import Link from 'next/link';
import { apiFetch, ApiError } from '../../../lib/api-client';
import { ExerciseCard } from '../../../components/exercise-card';

interface RutinaVigenteResponse {
  id: string;
  nombre: string;
  ejercicios: Array<{
    exerciseId: string;
    nombre: string;
    imageUrl: string | null;
    orden: number;
    series: number;
    repeticiones: number;
    peso: number | null;
    descanso: number;
  }>;
}

export default async function AlumnoPage() {
  let rutina: RutinaVigenteResponse | null = null;
  try {
    rutina = await apiFetch<RutinaVigenteResponse>('/users/me/rutina-vigente');
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    rutina = null;
  }

  if (!rutina) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col items-center gap-2 p-8 text-center">
        <h1 className="text-xl font-semibold text-text">Todavía no tenés una rutina asignada</h1>
        <p className="text-sm text-text-muted">
          Tu profesor te va a asignar una pronto — volvé a revisar más tarde.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold text-text">{rutina.nombre}</h1>

      <ul className="flex flex-col gap-3">
        {rutina.ejercicios
          .sort((a, b) => a.orden - b.orden)
          .map((ejercicio) => (
            <li key={ejercicio.exerciseId}>
              <Link href={`/catalogo/${ejercicio.exerciseId}`} className="flex gap-3">
                <div className="w-24 shrink-0">
                  <ExerciseCard
                    ejercicio={{
                      id: ejercicio.exerciseId,
                      nombre: ejercicio.nombre,
                      imageUrl: ejercicio.imageUrl,
                      parteCuerpo: '',
                      equipamiento: null,
                    }}
                  />
                </div>
                <div className="flex flex-col justify-center gap-1">
                  <p className="text-sm font-medium text-text">{ejercicio.nombre}</p>
                  <p className="text-xs text-text-muted">
                    {ejercicio.series} series × {ejercicio.repeticiones} reps
                    {ejercicio.peso !== null && ` — ${ejercicio.peso}kg`} — {ejercicio.descanso}s
                    descanso
                  </p>
                </div>
              </Link>
            </li>
          ))}
      </ul>
    </main>
  );
}
