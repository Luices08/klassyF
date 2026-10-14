import type { Jornada, NivelEducativo } from './enums';

/**
 * M07 — Planeación documental. El plan de área (anual) y el plan de aula (por periodo) son PDF que el docente carga y
 * coordinación revisa: aquí no hay banco de DBA, estándares ni contenidos estructurados.
 */

export const ESTADOS_PLAN = ['EN_REVISION', 'APROBADO', 'DEVUELTO'] as const;
export type EstadoPlan = (typeof ESTADOS_PLAN)[number];

/** Lo que muestra una pantalla: a los tres estados guardados se suma «sin cargar», que no existe como documento. */
export type EstadoPlanVista = EstadoPlan | 'SIN_CARGAR';

/** Lo que coordinación puede decidir sobre un plan que está en revisión. */
export const DECISIONES_REVISION = ['APROBADO', 'DEVUELTO'] as const;
export type DecisionRevision = (typeof DECISIONES_REVISION)[number];

/** Cada renglón del historial de un plan: las dos decisiones de la revisión y la reapertura de un aprobado. */
export const ACCIONES_REVISION = ['APROBADO', 'DEVUELTO', 'REABIERTO'] as const;
export type AccionRevision = (typeof ACCIONES_REVISION)[number];

export const ORIGENES_VERSION = ['CARGADA', 'ADOPTADA'] as const;
export type OrigenVersion = (typeof ORIGENES_VERSION)[number];

export type AccionPlan = 'RADICAR' | 'ADOPTAR' | 'APROBAR' | 'DEVOLVER' | 'REABRIR';

/**
 * Tabla de transiciones del plan. «Sin cargar» no es un estado guardado: el primer documento nace en revisión (o aprobado,
 * si es una adopción). Un plan devuelto vuelve a revisión al radicar la corrección, y un aprobado solo sale de ahí si el
 * administrador lo reabre con motivo.
 */
export const TRANSICIONES_PLAN: Record<EstadoPlanVista, Partial<Record<AccionPlan, EstadoPlan>>> = {
  SIN_CARGAR: { RADICAR: 'EN_REVISION', ADOPTAR: 'APROBADO' },
  EN_REVISION: { APROBAR: 'APROBADO', DEVOLVER: 'DEVUELTO' },
  DEVUELTO: { RADICAR: 'EN_REVISION' },
  APROBADO: { REABRIR: 'DEVUELTO' },
};

export const NOMBRES_ESTADO_PLAN: Record<EstadoPlanVista, string> = {
  SIN_CARGAR: 'sin cargar',
  EN_REVISION: 'en revisión',
  APROBADO: 'aprobado',
  DEVUELTO: 'devuelto con comentarios',
};

// Los PDF de apoyo del MEN pesan hasta ~16 MB (DBA de Ciencias Sociales); el tope deja margen sin abrir la puerta a cualquier archivo.
export const MAX_BYTES_PLANEACION = 25 * 1024 * 1024;
export const MIMETYPES_PLANEACION = new Set(['application/pdf']);

export const MAX_TITULO_PLAN = 150;
export const MAX_DESCRIPCION_PLAN = 2000;
export const MAX_COMENTARIO_REVISION = 2000;
export const MAX_NOMBRE_ARCHIVO = 120;

/** Cuánto antes de que termine el periodo previo se abre, por defecto, la entrega de los planes de aula. */
export const DIAS_ANTICIPO_APERTURA_ENTREGA = 14;

// --- Líderes de área: a qué parte de la institución responde cada uno ---

/**
 * Un colegio pequeño tiene un solo jefe por área; uno grande los separa por sección (p. ej. Matemáticas de Primaria y de Secundaria)
 * o por jornada. El alcance de cada líder se mide en nivel educativo y en «diurna / nocturna», y la sede es opcional (por defecto,
 * todas): la jornada operativa de un grupo decide si es diurna o nocturna con la tabla de abajo.
 */
export const TIPOS_JORNADA = ['DIURNA', 'NOCTURNA'] as const;
export type TipoJornada = (typeof TIPOS_JORNADA)[number];

export const ALCANCES_JORNADA = ['TODAS', ...TIPOS_JORNADA] as const;
export type AlcanceJornada = (typeof ALCANCES_JORNADA)[number];

/** La sabatina atiende al mismo público que la nocturna (jóvenes y adultos que trabajan), así que cuenta con ella. */
export const TIPO_DE_JORNADA: Record<Jornada, TipoJornada> = {
  MANANA: 'DIURNA',
  TARDE: 'DIURNA',
  UNICA: 'DIURNA',
  NOCTURNA: 'NOCTURNA',
  SABATINA: 'NOCTURNA',
};

export const NOMBRES_TIPO_JORNADA: Record<TipoJornada, string> = { DIURNA: 'Diurna', NOCTURNA: 'Nocturna' };

export const NOMBRES_NIVEL_EDUCATIVO: Record<NivelEducativo, string> = {
  PREESCOLAR: 'Preescolar',
  PRIMARIA: 'Primaria',
  SECUNDARIA: 'Secundaria',
  MEDIA: 'Media',
};
