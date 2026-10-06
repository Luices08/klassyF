import { EstadoPeriodoAcademico } from '../../../constants/enums';

// Minimo reglamentado en Colombia de semanas de trabajo academico por año lectivo.
export const SEMANAS_MINIMAS_ANIO_LECTIVO = 40;

// Maquina de estados del periodo (semaforo M05). Reabrir un periodo CERRADO es
// la unica transicion "hacia atras" y la restringe el servicio (solo ADMIN, con motivo).
export const TRANSICIONES_PERIODO: Record<EstadoPeriodoAcademico, readonly EstadoPeriodoAcademico[]> = {
  PROGRAMADO: ['ABIERTO'],
  ABIERTO: ['EN_DIGITACION', 'CERRADO'],
  EN_DIGITACION: ['CERRADO'],
  CERRADO: ['EN_DIGITACION'],
};

// Estados del periodo en los que un docente puede digitar notas.
export const ESTADOS_PERIODO_CALIFICABLES: readonly EstadoPeriodoAcademico[] = ['ABIERTO', 'EN_DIGITACION'];
