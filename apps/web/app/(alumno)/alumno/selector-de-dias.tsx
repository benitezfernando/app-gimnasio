'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ListaEjerciciosDelDia, EjercicioDeRutina } from './lista-ejercicios-del-dia';
import { claveDiaAlumno, diaInicialParaAlumno } from '../../../lib/routine-days';

function leerDiaGuardado(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function guardarDia(clave: string, numero: number): void {
  try {
    window.localStorage.setItem(clave, String(numero));
  } catch {
    // modo privado / almacenamiento bloqueado: se sigue sin recordar el día
  }
}

export function SelectorDeDias({
  rutinaId,
  dias,
}: {
  rutinaId: string;
  dias: Array<{ numero: number; ejercicios: EjercicioDeRutina[] }>;
}) {
  const clave = claveDiaAlumno(rutinaId);
  const [numero, setNumero] = useState(1);

  useEffect(() => {
    setNumero(diaInicialParaAlumno(leerDiaGuardado(clave), dias.length));
  }, [clave, dias.length]);

  function elegir(n: number) {
    setNumero(n);
    guardarDia(clave, n);
  }

  const dia = dias.find((d) => d.numero === numero) ?? dias[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Días de tu rutina">
        {dias.map((d) => (
          <Button
            key={d.numero}
            type="button"
            aria-pressed={d.numero === dia.numero}
            variant={d.numero === dia.numero ? 'brand' : 'outline'}
            size="sm"
            className="shrink-0"
            onClick={() => elegir(d.numero)}
          >
            Día {d.numero} ({d.ejercicios.length})
          </Button>
        ))}
      </div>
      <ListaEjerciciosDelDia ejercicios={dia.ejercicios} />
    </div>
  );
}
