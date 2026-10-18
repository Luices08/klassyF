import { NivelEducativo, TipoIngreso } from './enums';
import { CATEGORIAS_DOCUMENTO_MATRICULA, INDICACIONES_DOCUMENTO_MATRICULA, NOMBRES_DOCUMENTO_MATRICULA } from './matriculaChecklist';

/**
 * Qué condición del estudiante o de su familia hace que se pida un documento, además del grado y el tipo de ingreso. Es una lista cerrada que el
 * sistema sabe evaluar (no fórmulas libres): una condición nueva es una entrada aquí y su caso en `cumpleCondicion` (utils/requisitosDocumentales.ts).
 */
export const CONDICIONES_REQUISITO = ['NINGUNA', 'CON_DISCAPACIDAD', 'ACUDIENTE_NO_PADRE_MADRE'] as const;
export type CondicionRequisito = (typeof CONDICIONES_REQUISITO)[number];

export const NOMBRES_CONDICION_REQUISITO: Record<CondicionRequisito, string> = {
  NINGUNA: 'Sin condición',
  CON_DISCAPACIDAD: 'Solo si el estudiante tiene discapacidad (PIAR)',
  ACUDIENTE_NO_PADRE_MADRE: 'Solo si el acudiente no es padre ni madre',
};

/** Documentos cuya aprobación la da otro módulo del sistema (no es editable por el usuario). */
export const APROBACIONES_AUTOMATICAS = ['PAZ_Y_SALVO_ANIO_ANTERIOR'] as const;
export type AprobacionAutomatica = (typeof APROBACIONES_AUTOMATICAS)[number];

export const CATEGORIAS_REQUISITO = ['IDENTIFICACION_SALUD', 'TRAYECTORIA_ACADEMICA', 'INCLUSION_PIAR', 'INSTITUCIONAL'] as const;

export const PATRON_CLAVE_DOCUMENTO = /^[A-Z0-9_]{2,60}$/;
export const MAX_NOMBRE_REQUISITO = 120;
export const MAX_INDICACION_REQUISITO = 500;

/** Marca del contador que dice que el catálogo inicial ya se sembró (si el colegio elimina uno, no vuelve). */
export const MARCA_CATALOGO_SEMBRADO = 'REQUISITOS-DOCUMENTALES-SEMBRADO';

export interface RequisitoInicial {
  clave: string;
  nombre: string;
  obligatorio: boolean;
  niveles: NivelEducativo[];
  grados_numeros: number[];
  tipos_ingreso: TipoIngreso[];
  condicion_especial: CondicionRequisito;
  aprobacion_automatica: AprobacionAutomatica | null;
  orden: number;
}

const INGRESO_NUEVO: TipoIngreso[] = ['NUEVO', 'TRASLADO'];
const TODOS_LOS_NIVELES: NivelEducativo[] = ['PREESCOLAR', 'PRIMARIA', 'SECUNDARIA', 'MEDIA'];
const BASICA_Y_MEDIA: NivelEducativo[] = ['PRIMARIA', 'SECUNDARIA', 'MEDIA'];

const base = (clave: string, orden: number, extra: Partial<RequisitoInicial> = {}): RequisitoInicial => ({
  clave,
  nombre: NOMBRES_DOCUMENTO_MATRICULA[clave as keyof typeof NOMBRES_DOCUMENTO_MATRICULA] ?? clave,
  obligatorio: true,
  niveles: [],
  grados_numeros: [],
  tipos_ingreso: [],
  condicion_especial: 'NINGUNA',
  aprobacion_automatica: null,
  orden,
  ...extra,
});

/**
 * Lo que el sistema pedía antes de que el catálogo fuera configurable, hecho datos. Se siembra una sola vez; desde entonces es del colegio
 * (lo edita, lo desactiva o lo amplía). El orden reproduce el del checklist de siempre. El nombre del certificado del grado anterior lleva
 * `{grado_anterior}`, que se reemplaza por el número del grado anterior al matricular.
 */
export const REQUISITOS_INICIALES: RequisitoInicial[] = [
  base('DOCUMENTO_IDENTIDAD', 1),
  base('FOTO', 2),
  base('CARNE_EPS', 3),
  base('DOCUMENTO_ACUDIENTE', 4),
  base('CARNE_VACUNAS', 10, { niveles: ['PREESCOLAR'], grados_numeros: [1, 2] }),
  base('CERTIFICADO_CRECIMIENTO_DESARROLLO', 11, { niveles: ['PREESCOLAR'] }),
  base('CERTIFICADO_AUDIOMETRIA_VISION', 12, { niveles: ['PREESCOLAR'] }),
  base('CERTIFICADO_QUINTO_PRIMARIA', 20, { grados_numeros: [6], tipos_ingreso: INGRESO_NUEVO }),
  base('CERTIFICADO_GRADO_ANTERIOR', 21, { nombre: 'Certificado de {grado_anterior}° aprobado', grados_numeros: [2, 3, 4, 5, 7, 8, 9, 10, 11], tipos_ingreso: INGRESO_NUEVO }),
  base('CERTIFICADOS_NOTAS_ANTERIORES', 30, { niveles: BASICA_Y_MEDIA, tipos_ingreso: INGRESO_NUEVO }),
  base('PAZ_Y_SALVO_SIMAT', 31, { niveles: BASICA_Y_MEDIA, tipos_ingreso: INGRESO_NUEVO }),
  base('SERVICIO_SOCIAL_ESTUDIANTIL', 32, { grados_numeros: [11], tipos_ingreso: INGRESO_NUEVO }),
  base('PAZ_Y_SALVO_ANIO_ANTERIOR', 40, { niveles: TODOS_LOS_NIVELES, tipos_ingreso: ['ANTIGUO', 'REPITENTE'], aprobacion_automatica: 'PAZ_Y_SALVO_ANIO_ANTERIOR' }),
  base('DIAGNOSTICO_MEDICO_INCLUSION', 50, { condicion_especial: 'CON_DISCAPACIDAD' }),
  base('CUSTODIA_LEGAL_O_PODER', 60, { obligatorio: false, condicion_especial: 'ACUDIENTE_NO_PADRE_MADRE' }),
];

/** Indicación y categoría de partida de cada documento inicial (el resto de campos vive en `REQUISITOS_INICIALES`). */
export const indicacionInicial = (clave: string): string => INDICACIONES_DOCUMENTO_MATRICULA[clave as keyof typeof INDICACIONES_DOCUMENTO_MATRICULA] ?? '';
export const categoriaInicial = (clave: string): (typeof CATEGORIAS_REQUISITO)[number] =>
  CATEGORIAS_DOCUMENTO_MATRICULA[clave as keyof typeof CATEGORIAS_DOCUMENTO_MATRICULA] ?? 'INSTITUCIONAL';
