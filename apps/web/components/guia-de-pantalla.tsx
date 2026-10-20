'use client';

import { useEffect } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import {
  AlmacenGuias,
  Guia,
  claveGuia,
  guiaVista,
  marcarGuiaVista,
  siguienteGuia,
} from '../lib/guias';

const ESPERA_ANTES_DE_EMPEZAR_MS = 600;

/** Primer elemento visible con ese `data-guia` (la barra de abajo en celular, el sidebar en PC). */
function buscarVisible(nombre: string): Element | null {
  const candidatos = document.querySelectorAll(`[data-guia="${nombre}"]`);
  return Array.from(candidatos).find((el) => el.getClientRects().length > 0) ?? null;
}

function almacenDelNavegador(): AlmacenGuias | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Guías de globos que se muestran la primera vez que el usuario entra a la
 * pantalla (recordado por usuario en este navegador). Con varias guías, las
 * corre en orden: al cerrar una pasa a la siguiente pendiente.
 */
export function GuiaDePantalla({ userId, guias }: { userId: string; guias: Guia[] }) {
  useEffect(() => {
    const almacen = almacenDelNavegador();
    let cancelado = false;
    let activo: ReturnType<typeof driver> | null = null;

    function mostrarSiguiente() {
      if (cancelado) return;
      const guia = siguienteGuia(
        guias,
        (id) => guiaVista(almacen, claveGuia(userId, id)),
        (nombre) => buscarVisible(nombre) !== null,
      );
      if (!guia) return;

      const pasos: DriveStep[] = guia.pasos.map((paso) => ({
        element: paso.elemento ? (buscarVisible(paso.elemento) ?? undefined) : undefined,
        popover: { title: paso.titulo, description: paso.texto },
      }));

      activo = driver({
        steps: pasos,
        showProgress: pasos.length > 1,
        progressText: '{{current}} de {{total}}',
        nextBtnText: 'Siguiente',
        prevBtnText: 'Anterior',
        doneBtnText: 'Listo',
        popoverClass: 'guia-popover',
        // Ver y tocar lo resaltado no debe ejecutar acciones a mitad de la guía.
        disableActiveInteraction: true,
        onDestroyed: () => {
          // Salir de la pantalla a mitad de la guía no cuenta como vista.
          if (cancelado) return;
          marcarGuiaVista(almacen, claveGuia(userId, guia.id));
          activo = null;
          mostrarSiguiente();
        },
      });
      activo.drive();
    }

    const temporizador = setTimeout(mostrarSiguiente, ESPERA_ANTES_DE_EMPEZAR_MS);
    return () => {
      cancelado = true;
      clearTimeout(temporizador);
      activo?.destroy();
    };
    // `guias` son constantes de cada pantalla: se corre una vez por usuario.
  }, [userId]);

  return null;
}
