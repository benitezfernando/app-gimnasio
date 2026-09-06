'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const STORAGE_KEY = 'app-gimnasio-theme';

export function ThemeToggle() {
  const [oscuro, setOscuro] = useState(false);

  useEffect(() => {
    setOscuro(document.documentElement.classList.contains('dark'));
  }, []);

  function alternar() {
    const nuevoOscuro = !oscuro;
    setOscuro(nuevoOscuro);
    document.documentElement.classList.toggle('dark', nuevoOscuro);
    try {
      localStorage.setItem(STORAGE_KEY, nuevoOscuro ? 'dark' : 'light');
    } catch {
      // localStorage puede fallar (modo privado del navegador) — el
      // toggle sigue funcionando en memoria para esta sesión, solo no
      // persiste entre recargas.
    }
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={oscuro ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-text active:bg-surface-alt"
    >
      {oscuro ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
