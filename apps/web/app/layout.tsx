import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'App Gimnasio',
  description: 'Gestión de rutinas de gimnasio',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-surface text-text">{children}</body>
    </html>
  );
}
