import type { NivelDesempeno } from './enums';

/** DESCRIPCION: qué significa el nivel (Doc. 11 MEN: la valoración va con una descripción cualitativa). RECOMENDACION: apoyo o mejora sugerida. */
export const TIPOS_FRASE_BOLETIN = ['DESCRIPCION', 'RECOMENDACION'] as const;
export type TipoFraseBoletin = (typeof TIPOS_FRASE_BOLETIN)[number];

export const MAX_LONGITUD_FRASE = 400;
export const MAX_LONGITUD_OBSERVACION = 500;
export const MAX_LONGITUD_CANAL_RECLAMACIONES = 1200;

/**
 * Texto de partida del banco, para que el boletín nunca salga sin explicación. Es del colegio: cada texto se edita en
 * `/admin/boletin` y el SIEE manda. Las recomendaciones de Superior y Alto quedan vacías a propósito (no hay dificultad que apoyar).
 */
export const FRASES_POR_DEFECTO: Record<NivelDesempeno, Record<TipoFraseBoletin, string>> = {
  SUPERIOR: {
    DESCRIPCION: 'Supera ampliamente los desempeños esperados y demuestra un dominio sobresaliente de los aprendizajes del periodo.',
    RECOMENDACION: '',
  },
  ALTO: {
    DESCRIPCION: 'Alcanza los desempeños esperados con solidez y muestra buen dominio de los aprendizajes del periodo.',
    RECOMENDACION: '',
  },
  BASICO: {
    DESCRIPCION: 'Alcanza los desempeños mínimos necesarios, aunque algunos aprendizajes requieren mayor afianzamiento.',
    RECOMENDACION: 'Reforzar los temas del periodo con el acompañamiento del docente y practicar en casa con regularidad.',
  },
  BAJO: {
    DESCRIPCION: 'No alcanza todavía los desempeños necesarios del periodo.',
    RECOMENDACION: 'Asistir a las actividades de apoyo definidas por el colegio y acordar con el docente y la familia un plan de mejoramiento.',
  },
};

// --- Plantilla del boletín: todo lo que el colegio puede personalizar del documento que se imprime ---

/**
 * Las partes del boletín que el colegio puede mostrar, ocultar, retitular y reordenar. El encabezado (escudo y título) siempre va primero.
 * Salen de `boletines.pdf` (Decreto 1290/2009 y 1075/2015, SIEE): informe claro e integral, áreas con dificultades y apoyos, compromisos de
 * seguimiento, reclamaciones, periodicidad de entrega y estado de promoción.
 */
export const SECCIONES_BOLETIN = [
  'DATOS_ESTUDIANTE',
  'AREAS',
  'DIFICULTADES',
  'ESCALA',
  'ENTREGA',
  'CALENDARIO',
  'RECLAMACIONES',
  'COMPROMISOS',
  'PROMOCION',
  'FIRMAS',
] as const;
export type SeccionBoletin = (typeof SECCIONES_BOLETIN)[number];

/** MARCA_DE_AGUA pinta el escudo grande y tenue detrás del contenido, sin ocupar lugar en el encabezado. */
export const POSICIONES_ESCUDO = ['IZQUIERDA', 'CENTRO', 'DERECHA', 'MARCA_DE_AGUA'] as const;
export type PosicionEscudo = (typeof POSICIONES_ESCUDO)[number];

export const PAPELES_BOLETIN = ['LETTER', 'A4'] as const;
export type PapelBoletin = (typeof PAPELES_BOLETIN)[number];

/** Las tres familias de letra que trae el PDF sin instalar nada. */
export const FUENTES_BOLETIN = ['SANS', 'SERIF', 'MONO'] as const;
export type FuenteBoletin = (typeof FUENTES_BOLETIN)[number];

export const TAMANOS_TEXTO_BOLETIN = ['PEQUENO', 'NORMAL', 'GRANDE'] as const;
export type TamanoTextoBoletin = (typeof TAMANOS_TEXTO_BOLETIN)[number];

export const ESCUDO_TAMANO_MINIMO = 30;
export const ESCUDO_TAMANO_MAXIMO = 120;
export const MAX_FIRMAS_BOLETIN = 4;
export const MAX_OPCIONES_PROMOCION = 5;
export const MIN_LINEAS_COMPROMISOS = 1;
export const MAX_LINEAS_COMPROMISOS = 10;
export const MAX_LONGITUD_TITULO_BOLETIN = 120;
export const MAX_LONGITUD_PIE_BOLETIN = 600;
export const MAX_LONGITUD_TEXTO_BOLETIN = 220;
export const MAX_LONGITUD_APOYO_BOLETIN = 800;
/** El escudo propio del boletín se guarda como data URI, igual que el logo de la institución (M01). */
export const MAX_BYTES_ESCUDO = 500_000;

export interface SeccionPlantilla {
  clave: SeccionBoletin;
  /** Título que se imprime sobre la sección; vacío = sin título. */
  titulo: string;
  visible: boolean;
}

export interface FirmaBoletin {
  cargo: string;
  /** Nombre fijo de quien firma (rector, coordinadora...). Vacío = solo la línea para firmar a mano. */
  nombre: string;
  /** La firma es la del director del grupo del estudiante: su nombre sale del grupo, no se escribe aquí. */
  usa_director_grupo: boolean;
}

/**
 * Cada texto fijo que el sistema imprime en el boletín, para que ninguno sea del código sino del colegio. Algunos llevan marcas entre llaves
 * que se reemplazan al imprimir (`{puesto}`, `{total}`, `{fecha}`, `{periodo}`, `{anio}`, `{pendientes}`, `{nivel}`).
 */
export const CLAVES_TEXTOS_BOLETIN = [
  'promedio_general',
  'documento',
  'grado',
  'grupo',
  'inasistencias',
  'justificadas',
  'injustificadas',
  'retardos',
  'puesto',
  'periodo_linea',
  'jornada',
  'sin_cerrar',
  'falla',
  'sin_malla',
  'informe_parcial',
  'informe_parcial_faltan',
  'escala_columna_1',
  'escala_columna_2',
  'escala_columna_3',
  'escala_equivalencia',
  'fecha_entrega',
  'calendario_sin_fecha',
  'dificultades_intro',
  'dificultades_ninguna',
  'compromisos_intro',
  'promocion_intro',
  'homologada',
  'exenta',
  'convencion_homologada',
  'convencion_exenta',
  'traslado_linea',
] as const;
export type ClaveTextoBoletin = (typeof CLAVES_TEXTOS_BOLETIN)[number];

export interface PlantillaBoletin {
  titulo: string;
  subtitulo: string;
  mostrar_datos_institucion: boolean;
  mostrar_sede_jornada: boolean;
  escudo: {
    mostrar: boolean;
    posicion: PosicionEscudo;
    tamano: number;
    /** Escudo propio del boletín (data URI PNG/JPG). null = se usa el logo de la institución (M01). */
    url: string | null;
  };
  /** Color de los títulos y rótulos del PDF, #RRGGBB. */
  color_acento: string;
  papel: PapelBoletin;
  fuente: FuenteBoletin;
  tamano_texto: TamanoTextoBoletin;
  /** El orden de este arreglo es el orden en que se imprimen las secciones. */
  secciones: SeccionPlantilla[];
  estudiante: { documento: boolean; grado: boolean; grupo: boolean; inasistencias: boolean; promedio: boolean };
  asignaturas: {
    nota: boolean;
    desempeno: boolean;
    fallas: boolean;
    nota_area: boolean;
    /** Los bloques de la valoración (heteroevaluación, autoevaluación...) con su peso y su nota. */
    componentes: boolean;
    descripcion: boolean;
    recomendacion: boolean;
    observacion: boolean;
  };
  rotulos: { componentes: string; descripcion: string; recomendacion: string; observacion: string };
  /** Los textos fijos del documento (ver `CLAVES_TEXTOS_BOLETIN`). */
  textos: Record<ClaveTextoBoletin, string>;
  /** Actividades de apoyo y recuperación del colegio, tal como las define el SIEE; sale en la sección de dificultades. */
  texto_apoyo: string;
  /** Renglones en blanco para los compromisos de seguimiento, que se escriben a mano con la familia. */
  compromisos_lineas: number;
  /** Casillas para marcar a mano la decisión de promoción del informe final (hasta que existan las reglas de promoción, M19/M20). */
  promocion_opciones: string[];
  firmas: FirmaBoletin[];
  pie_texto: string;
}

export const TEXTOS_BOLETIN_INICIALES: Record<ClaveTextoBoletin, string> = {
  promedio_general: 'Promedio general',
  documento: 'Documento',
  grado: 'Grado',
  grupo: 'Grupo',
  inasistencias: 'Inasistencias',
  justificadas: 'justificadas',
  injustificadas: 'injustificadas',
  retardos: 'retardos',
  puesto: 'Puesto {puesto} de {total}',
  periodo_linea: '{periodo} · Año lectivo {anio}',
  jornada: 'Jornada',
  sin_cerrar: 'Sin cerrar',
  falla: 'falla(s)',
  sin_malla: 'No hay malla curricular configurada para el grado de este estudiante en este año lectivo.',
  informe_parcial: 'Informe parcial: solo muestra las asignaturas cuya planilla ya cerró el docente.',
  informe_parcial_faltan: 'Faltan: {pendientes}.',
  escala_columna_1: 'Escala del colegio',
  escala_columna_2: 'Rango',
  escala_columna_3: 'Equivale a (nacional)',
  escala_equivalencia: 'Desempeño {nivel}',
  fecha_entrega: 'Fecha de entrega a las familias: {fecha}.',
  calendario_sin_fecha: 'Por definir',
  dificultades_intro: 'Asignaturas en las que el estudiante no alcanzó los desempeños del periodo:',
  dificultades_ninguna: 'El estudiante no presenta asignaturas con desempeño bajo en este periodo.',
  compromisos_intro: 'Compromisos de seguimiento acordados con el estudiante y la familia:',
  promocion_intro: 'Decisión de promoción:',
  homologada: 'Homologada',
  exenta: 'Exenta',
  convencion_homologada:
    '(H) Nota homologada: proviene de la institución de procedencia del estudiante (traslado) y se convirtió a la escala de valoración de este colegio.',
  convencion_exenta: 'E: Asignatura exenta por traslado: la institución de procedencia no la impartía; no tiene nota y no cuenta en el promedio ni en la promoción.',
  traslado_linea: 'Ingresó por traslado el {fecha}, procedente de {institucion}; cursa en este colegio desde el {periodo}.',
};

/** Cómo sale el boletín mientras el colegio no lo personalice. */
export const PLANTILLA_BOLETIN_INICIAL: PlantillaBoletin = {
  titulo: 'Informe de evaluación',
  subtitulo: '',
  mostrar_datos_institucion: true,
  mostrar_sede_jornada: true,
  escudo: { mostrar: true, posicion: 'IZQUIERDA', tamano: 52, url: null },
  color_acento: '#2878EA',
  papel: 'LETTER',
  fuente: 'SANS',
  tamano_texto: 'NORMAL',
  secciones: [
    { clave: 'DATOS_ESTUDIANTE', titulo: '', visible: true },
    { clave: 'AREAS', titulo: '', visible: true },
    { clave: 'DIFICULTADES', titulo: 'Áreas y aprendizajes con dificultades', visible: true },
    { clave: 'ESCALA', titulo: 'Escala de valoración y equivalencia nacional', visible: true },
    { clave: 'ENTREGA', titulo: 'Entrega del informe', visible: true },
    { clave: 'CALENDARIO', titulo: 'Calendario de entrega de informes', visible: false },
    { clave: 'RECLAMACIONES', titulo: 'Aclaraciones y reclamaciones', visible: true },
    { clave: 'COMPROMISOS', titulo: 'Compromisos de seguimiento', visible: true },
    { clave: 'PROMOCION', titulo: 'Estado de promoción', visible: false },
    { clave: 'FIRMAS', titulo: '', visible: false },
  ],
  estudiante: { documento: true, grado: true, grupo: true, inasistencias: true, promedio: true },
  asignaturas: { nota: true, desempeno: true, fallas: true, nota_area: true, componentes: false, descripcion: true, recomendacion: true, observacion: true },
  rotulos: { componentes: 'Valoración', descripcion: 'Descripción', recomendacion: 'Recomendación', observacion: 'Observación del docente' },
  textos: TEXTOS_BOLETIN_INICIALES,
  texto_apoyo: '',
  compromisos_lineas: 3,
  promocion_opciones: ['Promovido', 'No promovido', 'Pendiente de plan de apoyo'],
  firmas: [
    { cargo: 'Rector(a)', nombre: '', usa_director_grupo: false },
    { cargo: 'Director(a) de grupo', nombre: '', usa_director_grupo: true },
    { cargo: 'Acudiente', nombre: '', usa_director_grupo: false },
  ],
  pie_texto: '',
};

/** El informe final del año (M33) se publica a las familias aparte del boletín de cada periodo; comparte la publicación con este número de periodo. */
export const PERIODO_INFORME_FINAL = 0;
