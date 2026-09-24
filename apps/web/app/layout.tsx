import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Gimnasio Mix',
  description: 'Gestión de rutinas de Gimnasio Mix',
};

export const viewport = {
  themeColor: '#0D0D14',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className="dark">
      <body>{children}</body>
    </html>
  );
}
