import { DiaPlantillaAGuardar } from '../../../application/ports/routine-template-repository.port';
import { EjercicioItem } from '../../../application/ports/routine-template-repository.port';
import { DiaInstanciaDto, DiaNuevoDto, DiaPlantillaDto } from './dia.dto';
import { toEjercicioItems } from './ejercicio.mapper';

export function toDiasPlantilla(dtos: DiaPlantillaDto[]): DiaPlantillaAGuardar[] {
  return dtos.map((dto) => ({
    ...(dto.id ? { id: dto.id } : {}),
    ejercicios: toEjercicioItems(dto.ejercicios),
  }));
}

export interface DiaInstanciaPedido {
  id?: string;
  vinculadoADiaId?: string;
  ejercicios: EjercicioItem[];
}

export function toDiasInstancia(dtos: DiaInstanciaDto[]): DiaInstanciaPedido[] {
  return dtos.map((dto) => ({
    ...(dto.id ? { id: dto.id } : {}),
    ...(dto.vinculadoADiaId ? { vinculadoADiaId: dto.vinculadoADiaId } : {}),
    ejercicios: toEjercicioItems(dto.ejercicios),
  }));
}

export function toDiasNuevos(dtos: DiaNuevoDto[]): Omit<DiaInstanciaPedido, 'id'>[] {
  return dtos.map((dto) => ({
    ...(dto.vinculadoADiaId ? { vinculadoADiaId: dto.vinculadoADiaId } : {}),
    ejercicios: toEjercicioItems(dto.ejercicios),
  }));
}
