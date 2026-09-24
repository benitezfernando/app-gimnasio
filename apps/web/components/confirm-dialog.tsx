'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface ConfirmOptions {
  titulo: string;
  descripcion: string;
  confirmarLabel?: string;
  destructiva?: boolean;
}

type Confirmar = (opciones: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirmar | null>(null);

// Reemplaza window.confirm: en la app Android (TWA) el diálogo nativo de
// Chrome muestra el dominio del sitio y rompe la sensación de app.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opciones, setOpciones] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((valor: boolean) => void) | null>(null);

  const confirmar = useCallback<Confirmar>(
    (nuevas) =>
      new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
        setOpciones(nuevas);
      }),
    [],
  );

  function cerrar(valor: boolean) {
    resolverRef.current?.(valor);
    resolverRef.current = null;
    setOpciones(null);
  }

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      <AlertDialog
        open={opciones !== null}
        onOpenChange={(abierto) => {
          if (!abierto) cerrar(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opciones?.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{opciones?.descripcion}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => cerrar(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant={opciones?.destructiva ? 'destructive' : 'default'}
              onClick={() => cerrar(true)}
            >
              {opciones?.confirmarLabel ?? 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirmar {
  const confirmar = useContext(ConfirmContext);
  if (!confirmar) {
    throw new Error('useConfirm requiere <ConfirmProvider> en el layout raíz');
  }
  return confirmar;
}
