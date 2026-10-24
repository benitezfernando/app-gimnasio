'use client';

import { useEffect, useState } from 'react';
import { browserApiFetch, BrowserApiError } from '../lib/browser-api-client';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface DeletionImpact {
  plantillasABorrar: number;
  instanciasABorrar: number;
  instanciasQueSobreviven: number;
  instanciasDeOtrosProfesores: number;
  vinculosDeCarteraABorrar: number;
  otrosProfesores: number;
}

export type EliminarUsuario = (
  userId: string,
) => Promise<{ error: string | null; advertencia?: string }>;

/**
 * HU-03c: nunca un window.confirm genérico para esta acción — el Admin
 * tiene que ver el impacto real antes de poder confirmar (la cascada de
 * un PROFESOR no es predecible de memoria). Lo usan el Admin y el profesor
 * (sobre sus alumnos); cada uno pasa su propia acción de eliminar.
 */
export function DeletePermanentlyDialog({
  userId,
  nombre,
  onEliminar,
  onCerrado,
}: {
  userId: string;
  nombre: string;
  onEliminar: EliminarUsuario;
  onCerrado: () => void;
}) {
  const [impacto, setImpacto] = useState<DeletionImpact | null>(null);
  const [cargando, setCargando] = useState(true);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advertencia, setAdvertencia] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    async function cargarImpacto() {
      try {
        const respuesta = await browserApiFetch<DeletionImpact>(`users/${userId}/deletion-impact`);
        if (!cancelado) setImpacto(respuesta);
      } catch (err) {
        if (cancelado) return;
        setError(err instanceof BrowserApiError ? err.message : 'No se pudo calcular el impacto.');
      } finally {
        if (!cancelado) setCargando(false);
      }
    }
    cargarImpacto();
    return () => {
      cancelado = true;
    };
  }, [userId]);

  async function confirmar() {
    setEliminando(true);
    setError(null);
    const resultado = await onEliminar(userId);
    if (resultado.error) {
      setError(resultado.error);
      setEliminando(false);
      return;
    }
    if (resultado.advertencia) {
      setAdvertencia(resultado.advertencia);
      setEliminando(false);
      return;
    }
    onCerrado();
  }

  return (
    <AlertDialog
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrado();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar a {nombre} definitivamente</AlertDialogTitle>
          <AlertDialogDescription>
            {cargando ? 'Calculando impacto...' : 'Esta acción borra en cascada:'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {impacto && (
          <ul className="flex flex-col gap-1 text-sm">
            <li>Plantillas que se borran: {impacto.plantillasABorrar}</li>
            <li>Rutinas de alumnos que se borran: {impacto.instanciasABorrar}</li>
            <li>
              Rutinas que sobreviven (alumno con otro profesor): {impacto.instanciasQueSobreviven}
            </li>
            <li>Vínculos de cartera que se borran: {impacto.vinculosDeCarteraABorrar}</li>
          </ul>
        )}

        {impacto && impacto.otrosProfesores > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              Este alumno también tiene {impacto.otrosProfesores}{' '}
              {impacto.otrosProfesores === 1 ? 'profesor más' : 'profesores más'}. Se pierden{' '}
              {impacto.instanciasDeOtrosProfesores}{' '}
              {impacto.instanciasDeOtrosProfesores === 1
                ? 'rutina armada por ese profesor'
                : 'rutinas armadas por esos profesores'}
              , y el alumno deja de estar en su cartera.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {advertencia && (
          <Alert variant="destructive">
            <AlertDescription>{advertencia}</AlertDescription>
          </Alert>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          {/* Button común, no AlertDialogAction: la acción es async y el
                diálogo tiene que quedar abierto hasta que termine. */}
          <Button
            type="button"
            variant="destructive"
            onClick={confirmar}
            disabled={cargando || eliminando || !impacto}
          >
            {eliminando && <Spinner data-icon="inline-start" />}
            {eliminando ? 'Eliminando...' : 'Eliminar definitivamente'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
