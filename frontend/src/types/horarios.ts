import type { EstadoActivo } from './domain';

/**
 * M09 — Horarios. Espejo del contrato de `backend/src/constants/horarios.ts`: tipos, alcances y metadatos de cada
 * variable. Si se agrega un tipo allá, se agrega aquí en el mismo cambio (regla de consistencia de API de CLAUDE.md).
 */

export const TIPOS_ALCANCE_HORARIO = ['GLOBAL', 'GRADOS'] as const;
export type TipoAlcanceHorario = (typeof TIPOS_ALCANCE_HORARIO)[number];

export type SeveridadVariableHorario = 'DURA' | 'BLANDA';
export type ValorDisponibilidad = 'NO_DISPONIBLE' | 'CONDICIONAL';
export type OrdenConsecutivas = 'ESPECIFICADO' | 'ARBITRARIO';
export type EstadoHorario = 'GENERANDO' | 'FALLIDO' | 'BORRADOR' | 'PUBLICADO' | 'ARCHIVADO';

export const TIPOS_VARIABLE_HORARIO = [
  'DISTRIBUCION_BLOQUES',
  'REUNION_COLECTIVA',
  'DISPONIBILIDAD',
  'NO_MISMO_DIA',
  'NO_CONSECUTIVAS',
  'DISTRIBUCION_SEMANAL',
  'MISMO_DIA',
  'CONSECUTIVAS',
  'RECREO_NO_INTERRUMPE',
  'MISMA_FRANJA_CADA_DIA',
  'MAX_HORAS_DIA_GRUPO',
  'MAX_HUECOS_GRUPO',
  'SIMULTANEAS',
  'MISMO_DIA_ENTRE_GRUPOS',
  'MAX_HORAS_DIA_DOCENTE',
  'MAX_HUECOS_DOCENTE',
  'MAX_CONSECUTIVAS_DOCENTE',
  'ESPACIO_REQUERIDO',
] as const;
export type TipoVariableHorario = (typeof TIPOS_VARIABLE_HORARIO)[number];

export type CategoriaVariableHorario = 'CARGA' | 'DISPONIBILIDAD' | 'GRUPO' | 'ENTRE_GRUPOS' | 'DOCENTE' | 'ESPACIO';

export const NOMBRES_CATEGORIA_VARIABLE: Record<CategoriaVariableHorario, string> = {
  CARGA: 'Carga y bloques',
  DISPONIBILIDAD: 'Tiempo libre',
  GRUPO: 'Dentro de cada grupo',
  ENTRE_GRUPOS: 'Entre grupos',
  DOCENTE: 'Docentes',
  ESPACIO: 'Espacios',
};

export interface MetadatoVariable {
  categoria: CategoriaVariableHorario;
  etiqueta: string;
  /** Explicación corta para el formulario. */
  ayuda: string;
  usaAlcance: boolean;
  /** Cuántas asignaturas exige (null = libre). 0 = no se eligen asignaturas. */
  asignaturasExactas: number | null;
  /** Se filtra por docentes (reuniones y reglas de docente). */
  usaDocentes: boolean;
  severidadPorDefecto: SeveridadVariableHorario;
}

export const METADATOS_VARIABLE: Record<TipoVariableHorario, MetadatoVariable> = {
  DISTRIBUCION_BLOQUES: { categoria: 'CARGA', etiqueta: 'Partir las horas semanales en bloques', ayuda: 'Ej. Matemáticas de 5 horas en bloques 2, 2, 1. Si el patrón no suma las horas de un grupo, se usa su bloque mayor.', usaAlcance: true, asignaturasExactas: null, usaDocentes: false, severidadPorDefecto: 'DURA' },
  REUNION_COLECTIVA: { categoria: 'CARGA', etiqueta: 'Reunión de docentes en la misma franja', ayuda: 'Los docentes elegidos quedan sin clase a la vez (ej. reunión de área).', usaAlcance: false, asignaturasExactas: 0, usaDocentes: true, severidadPorDefecto: 'DURA' },
  DISPONIBILIDAD: { categoria: 'DISPONIBILIDAD', etiqueta: 'Tiempo libre', ayuda: 'Se edita en la pestaña Tiempo libre.', usaAlcance: true, asignaturasExactas: null, usaDocentes: true, severidadPorDefecto: 'DURA' },
  NO_MISMO_DIA: { categoria: 'GRUPO', etiqueta: 'No pueden darse en el mismo día', ayuda: 'Con una asignatura: sus sesiones van en días distintos. Con varias: ninguna coincide de día con otra.', usaAlcance: true, asignaturasExactas: null, usaDocentes: false, severidadPorDefecto: 'BLANDA' },
  NO_CONSECUTIVAS: { categoria: 'GRUPO', etiqueta: 'No pueden ser consecutivas', ayuda: 'Ej. Tecnología y Educación Física no van una detrás de otra.', usaAlcance: true, asignaturasExactas: null, usaDocentes: false, severidadPorDefecto: 'BLANDA' },
  DISTRIBUCION_SEMANAL: { categoria: 'GRUPO', etiqueta: 'Distribución a lo largo de la semana', ayuda: 'Máximo de sesiones por día y mínimo de días distintos de cada asignatura.', usaAlcance: true, asignaturasExactas: null, usaDocentes: false, severidadPorDefecto: 'BLANDA' },
  MISMO_DIA: { categoria: 'GRUPO', etiqueta: 'Dos asignaturas deben darse el mismo día', ayuda: 'El día que se da una, se da la otra.', usaAlcance: true, asignaturasExactas: 2, usaDocentes: false, severidadPorDefecto: 'BLANDA' },
  CONSECUTIVAS: { categoria: 'GRUPO', etiqueta: 'Dos asignaturas deben ser consecutivas', ayuda: 'Cada sesión de una va pegada a una de la otra.', usaAlcance: true, asignaturasExactas: 2, usaDocentes: false, severidadPorDefecto: 'BLANDA' },
  RECREO_NO_INTERRUMPE: { categoria: 'GRUPO', etiqueta: 'El descanso no puede partir un bloque', ayuda: 'Un bloque de 2 o más horas queda entero antes o después del descanso.', usaAlcance: true, asignaturasExactas: null, usaDocentes: false, severidadPorDefecto: 'DURA' },
  MISMA_FRANJA_CADA_DIA: { categoria: 'GRUPO', etiqueta: 'Debe estar en la misma franja cada día', ayuda: 'La asignatura empieza siempre a la misma hora.', usaAlcance: true, asignaturasExactas: null, usaDocentes: false, severidadPorDefecto: 'BLANDA' },
  MAX_HORAS_DIA_GRUPO: { categoria: 'GRUPO', etiqueta: 'Máximo de horas de una asignatura por día', ayuda: 'Horas de la misma asignatura que un grupo puede ver en un día.', usaAlcance: true, asignaturasExactas: null, usaDocentes: false, severidadPorDefecto: 'BLANDA' },
  MAX_HUECOS_GRUPO: { categoria: 'GRUPO', etiqueta: 'Máximo de horas libres intermedias del grupo', ayuda: 'Horas sin clase entre la primera y la última del día.', usaAlcance: true, asignaturasExactas: 0, usaDocentes: false, severidadPorDefecto: 'BLANDA' },
  SIMULTANEAS: { categoria: 'ENTRE_GRUPOS', etiqueta: 'A la misma hora en todos los grupos del grado', ayuda: 'Ej. Inglés por niveles: todos los grupos de los grados elegidos lo ven a la vez.', usaAlcance: true, asignaturasExactas: null, usaDocentes: false, severidadPorDefecto: 'DURA' },
  MISMO_DIA_ENTRE_GRUPOS: { categoria: 'ENTRE_GRUPOS', etiqueta: 'El mismo día en todos los grupos del grado', ayuda: 'Las sesiones coinciden de día (no de hora) entre los grupos.', usaAlcance: true, asignaturasExactas: null, usaDocentes: false, severidadPorDefecto: 'BLANDA' },
  MAX_HORAS_DIA_DOCENTE: { categoria: 'DOCENTE', etiqueta: 'Máximo de horas de clase por día', ayuda: 'Sin docentes elegidos aplica a todos.', usaAlcance: false, asignaturasExactas: 0, usaDocentes: true, severidadPorDefecto: 'DURA' },
  MAX_HUECOS_DOCENTE: { categoria: 'DOCENTE', etiqueta: 'Máximo de horas libres intermedias por día', ayuda: 'Horas huecas entre la primera y la última clase del docente.', usaAlcance: false, asignaturasExactas: 0, usaDocentes: true, severidadPorDefecto: 'BLANDA' },
  MAX_CONSECUTIVAS_DOCENTE: { categoria: 'DOCENTE', etiqueta: 'Máximo de horas seguidas', ayuda: 'Horas de clase sin pausa.', usaAlcance: false, asignaturasExactas: 0, usaDocentes: true, severidadPorDefecto: 'BLANDA' },
  ESPACIO_REQUERIDO: { categoria: 'ESPACIO', etiqueta: 'Debe darse en uno de estos espacios', ayuda: 'Ej. Ciencias de 10° y 11° en el laboratorio. Sin esta regla la clase va al salón del grupo.', usaAlcance: true, asignaturasExactas: null, usaDocentes: false, severidadPorDefecto: 'DURA' },
};

export interface VariableHorario {
  _id: string;
  academic_year_id: string;
  jornada_id: string;
  tipo: TipoVariableHorario;
  descripcion: string;
  severidad: SeveridadVariableHorario;
  peso: number;
  alcance: { tipo: TipoAlcanceHorario; grade_ids: string[] };
  asignatura_ids: string[];
  docente_ids: string[];
  parametros: Record<string, unknown>;
  es_excepcion: boolean;
  estado: EstadoActivo;
}

export interface CeldaDisponibilidad {
  dia: number;
  periodo: number;
  valor: ValorDisponibilidad;
}

export interface EstructuraSemana {
  dias: number[];
  periodos: Array<{ nombre: string; hora_inicio: string; hora_fin: string; descanso_antes: boolean }>;
}

export interface CatalogoHorario {
  grupos: Array<{ _id: string; etiqueta: string; etiqueta_corta: string; grade_id: string }>;
  docentes: Array<{ _id: string; nombre: string }>;
  asignaturas: Array<{ _id: string; nombre: string; abreviatura: string }>;
  espacios: Array<{ _id: string; nombre: string }>;
  reuniones: Array<{ _id: string; nombre: string }>;
}

export interface AvisoHorario {
  codigo: string;
  mensaje: string;
}

export interface InsumosHorario {
  estructura: EstructuraSemana;
  periodos_semana: number;
  total_sesiones: number;
  grupos: Array<CatalogoHorario['grupos'][number] & { horas: number }>;
  docentes: Array<CatalogoHorario['docentes'][number] & { horas: number }>;
  avisos: AvisoHorario[];
  catalogo: CatalogoHorario;
}

export interface SesionHorario {
  _id: string;
  clave: string;
  asignacion_id: string | null;
  reunion_variable_id: string | null;
  group_id: string | null;
  subject_id: string | null;
  docente_ids: string[];
  dia: number;
  periodo: number;
  duracion: number;
  espacio_id: string | null;
  fija: boolean;
}

export interface IncidenciaHorario {
  codigo: string;
  variable_id: string | null;
  dura: boolean;
  magnitud: number;
  claves_sesion: string[];
  mensaje: string;
}

export interface ResumenHorario {
  _id: string;
  version: number;
  nombre: string;
  estado: EstadoHorario;
  conflictos_duros: number;
  penalizacion_blanda: number;
  avisos: AvisoHorario[];
  generacion: { semilla: number; iteraciones: number; duracion_ms: number } | null;
  error_generacion: string | null;
  publicado_en: string | null;
  createdAt: string;
}

export interface Horario extends ResumenHorario {
  sesiones: SesionHorario[];
  incidencias: IncidenciaHorario[];
}

export interface DetalleHorario {
  horario: Horario;
  estructura: EstructuraSemana;
  catalogo: CatalogoHorario;
  franjas_cambiaron: boolean;
}

export type VistaPdfHorario = 'GRUPO' | 'DOCENTE' | 'GENERAL';

/** Un horario publicado que le corresponde a quien consulta (solo sus sesiones). */
export interface MiHorario extends DetalleHorario {
  titulo: string;
  vista: 'GRUPO' | 'DOCENTE';
  entidad_id: string;
}
