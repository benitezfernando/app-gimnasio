import './globals.css';
import type { ReactNode } from 'react';
import { ThemeToggle } from '../components/theme-toggle';

export const metadata = {
  title: 'App Gimnasio',
  description: 'Gestión de rutinas de gimnasio',
};

// Corre antes de hidratar React — evita el flash de tema incorrecto
// (aplicar la clase 'dark' recién en un useEffect se vería después del
// primer paint). Patrón estándar de Next.js para esto.
const SCRIPT_TEMA = `
(function () {
  try {
    var guardado = localStorage.getItem('app-gimnasio-theme');
    var oscuro = guardado
      ? guardado === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', oscuro);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="bg-surface text-text">
        <div className="flex justify-end p-3">
          <ThemeToggle />
        </div>
        {children}
      </body>
    </html>
  );
}
