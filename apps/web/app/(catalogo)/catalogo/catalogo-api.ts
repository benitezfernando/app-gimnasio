import type { ExerciseCardData } from '../../../components/exercise-card';

// Vive fuera de `catalogo-cliente.tsx` a propósito: lo que un Server
// Component importa de un módulo 'use client' le llega como referencia de
// cliente, no como valor (la constante se convertía en una función y
// rompía la URL de la primera página).

export interface ListExercisesResponse {
  items: ExerciseCardData[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const LIMITE_POR_PAGINA = 24;
