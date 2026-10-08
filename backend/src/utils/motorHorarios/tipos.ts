import {
  OrdenConsecutivas,
  SeveridadVariableHorario,
  TipoAlcanceHorario,
  ValorDisponibilidad,
} from '../../constants/horarios';

/**
 * Tipos del motor de horarios (M09). El motor no conoce Mongoose: el servicio traduce documentos a estas formas
 * (ids como string) y guarda el resultado. Así se prueba con datos en memoria.
 */

export interface AlcanceMotor {
  tipo: TipoAlcanceHorario;
  /** Ids del catálogo `Grade` (vacío si el alcance es GLOBAL). */
  grade_ids: string[];
}

/** Celda de la malla de tiempo libre. `dia` es ISO (1 = lunes); `periodo` es el índice (0…) entre las franjas de CLASE. */
export interface CeldaDisponibilidad {
  dia: number;
  periodo: number;
  valor: ValorDisponibilidad;
}

interface VariableBase {
  id: string;
  severidad: SeveridadVariableHorario;
  peso: number;
  alcance: AlcanceMotor;
  /** Vacío = todas las asignaturas. */
  asignatura_ids: string[];
  /** Vacío = todos los docentes. */
  docente_ids: string[];
  /** Anula, para lo que cubre, las variables del mismo tipo igual o menos específicas (ej. "excepto 11°"). */
  es_excepcion: boolean;
}

export type VariableMotor = VariableBase &
  (
    | { tipo: 'DISTRIBUCION_BLOQUES'; parametros: { bloques: number[] } }
    | { tipo: 'REUNION_COLECTIVA'; parametros: { nombre: string; duracion: number; sesiones: number } }
    | { tipo: 'DISPONIBILIDAD'; parametros: { celdas: CeldaDisponibilidad[] } }
    | { tipo: 'NO_MISMO_DIA'; parametros: Record<string, never> }
    | { tipo: 'NO_CONSECUTIVAS'; parametros: { descanso_separa: boolean } }
    | { tipo: 'DISTRIBUCION_SEMANAL'; parametros: { max_sesiones_dia?: number; min_dias_distintos?: number } }
    | { tipo: 'MISMO_DIA'; parametros: Record<string, never> }
    | { tipo: 'CONSECUTIVAS'; parametros: { orden: OrdenConsecutivas } }
    | { tipo: 'RECREO_NO_INTERRUMPE'; parametros: Record<string, never> }
    | { tipo: 'MISMA_FRANJA_CADA_DIA'; parametros: Record<string, never> }
    | { tipo: 'MAX_HORAS_DIA_GRUPO'; parametros: { max: number } }
    | { tipo: 'MAX_HUECOS_GRUPO'; parametros: { max_por_dia: number } }
    | { tipo: 'SIMULTANEAS'; parametros: Record<string, never> }
    | { tipo: 'MISMO_DIA_ENTRE_GRUPOS'; parametros: Record<string, never> }
    | { tipo: 'MAX_HORAS_DIA_DOCENTE'; parametros: { max: number } }
    | { tipo: 'MAX_HUECOS_DOCENTE'; parametros: { max_por_dia: number } }
    | { tipo: 'MAX_CONSECUTIVAS_DOCENTE'; parametros: { max: number; descanso_separa: boolean } }
    | { tipo: 'ESPACIO_REQUERIDO'; parametros: { espacio_ids: string[] } }
  );

export type VariableDeTipo<T extends VariableMotor['tipo']> = Extract<VariableMotor, { tipo: T }>;

/** Lo que identifica a una sesión frente a las variables (para decidir si una variable le aplica). */
export interface SujetoVariable {
  group_id: string | null;
  grade_id: string | null;
  subject_id: string | null;
  docente_ids: string[];
}

/** Carga de clase que viene de M08 (`TeacherAssignment` CLASE), con su grado ya resuelto. */
export interface AsignacionMotor {
  id: string;
  docente_id: string;
  group_id: string;
  grade_id: string;
  subject_id: string;
  horas_semanales: number;
}

export interface SesionMotor extends SujetoVariable {
  id: string;
  asignacion_id: string | null;
  /** Variable REUNION_COLECTIVA que la originó, si no es una clase. */
  reunion_variable_id: string | null;
  duracion: number;
  /** k-ésima sesión de su asignación (0…): empareja las sesiones SIMULTANEAS entre grupos. */
  indice: number;
  /** null = usa el salón titular del grupo y no compite por espacio. */
  espacios_permitidos: string[] | null;
  /** Posición fijada a mano por el coordinador: el motor no la mueve. */
  fija: UbicacionFija | null;
}

/** Lo que se guarda y lo que ve el usuario: día ISO (1 = lunes) y periodo (0…) entre las franjas de CLASE. */
export interface UbicacionFija {
  dia: number;
  periodo: number;
}

/** Uso interno del motor: `dia` es el índice dentro de `EstructuraSemana.dias`, no el día ISO. */
export interface Posicion {
  dia: number;
  periodo: number;
}

export interface PeriodoClase {
  nombre: string;
  hora_inicio: string;
  hora_fin: string;
  /** Hay una franja de DESCANSO justo antes de este periodo. */
  descanso_antes: boolean;
}

export interface EstructuraSemana {
  /** Días ISO en que opera la jornada, en orden. */
  dias: number[];
  periodos: PeriodoClase[];
}

export interface EspacioMotor {
  id: string;
  admite_grupos_simultaneos: boolean;
}

export interface EntradaMotor {
  estructura: EstructuraSemana;
  sesiones: SesionMotor[];
  variables: VariableMotor[];
  espacios: EspacioMotor[];
}

export type CodigoIncidencia =
  | 'CHOQUE_GRUPO'
  | 'CHOQUE_DOCENTE'
  | 'CHOQUE_ESPACIO'
  | VariableMotor['tipo'];

export interface Incidencia {
  codigo: CodigoIncidencia;
  variable_id: string | null;
  dura: boolean;
  /** Cuántas veces se incumple (ej. 2 choques). La penalización blanda es magnitud × peso. */
  magnitud: number;
  sesion_ids: string[];
  mensaje: string;
}

export interface Aviso {
  codigo: string;
  mensaje: string;
}
