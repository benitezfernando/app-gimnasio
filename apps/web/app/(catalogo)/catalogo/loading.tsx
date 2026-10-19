import { Spinner } from '@/components/ui/spinner';

/** Feedback inmediato al entrar al catálogo mientras el servidor trae la primera página. */
export default function CargandoCatalogo() {
  return (
    <main className="flex w-full justify-center px-4 pt-16">
      <Spinner aria-label="Cargando catálogo" />
    </main>
  );
}
