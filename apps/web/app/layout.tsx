import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Gimnasio Mix',
  description: 'Gestión de rutinas de Gimnasio Mix',
};

export const viewport = {
  themeColor: '#141414',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-surface text-text">{children}</body>
    </html>
  );
}
