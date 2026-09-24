import './globals.css';
import type { ReactNode } from 'react';
import { ConfirmProvider } from '@/components/confirm-dialog';

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
      <body>
        <ConfirmProvider>{children}</ConfirmProvider>
      </body>
    </html>
  );
}
