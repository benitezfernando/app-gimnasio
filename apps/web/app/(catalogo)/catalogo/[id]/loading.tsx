import { Spinner } from '@/components/ui/spinner';

/** Feedback inmediato al tocar un ejercicio mientras el servidor trae el detalle. */
export default function CargandoEjercicio() {
  return (
    <main className="flex w-full justify-center px-4 pt-16">
      <Spinner aria-label="Cargando ejercicio" />
    </main>
  );
}
