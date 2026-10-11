import { NivelEducativo, TipoDocumentoMatricula, TipoIngreso } from './enums';

/**
 * Checklist documental minimo por nivel educativo (M04). Mantenido para retrocompatibilidad.
 */
export const DOCUMENTOS_REQUERIDOS_POR_NIVEL: Record<NivelEducativo, TipoDocumentoMatricula[]> = {
  PREESCOLAR: [
    'DOCUMENTO_IDENTIDAD',
    'FOTO',
    'CARNE_EPS',
    'DOCUMENTO_ACUDIENTE',
    'CARNE_VACUNAS',
    'CERTIFICADO_CRECIMIENTO_DESARROLLO',
    'CERTIFICADO_AUDIOMETRIA_VISION',
  ],
  PRIMARIA: [
    'DOCUMENTO_IDENTIDAD',
    'FOTO',
    'CARNE_EPS',
    'DOCUMENTO_ACUDIENTE',
    'CARNE_VACUNAS',
    'CERTIFICADOS_NOTAS_ANTERIORES',
    'PAZ_Y_SALVO_SIMAT',
  ],
  SECUNDARIA: [
    'DOCUMENTO_IDENTIDAD',
    'FOTO',
    'CARNE_EPS',
    'DOCUMENTO_ACUDIENTE',
    'CERTIFICADO_QUINTO_PRIMARIA',
    'CERTIFICADOS_NOTAS_ANTERIORES',
    'PAZ_Y_SALVO_SIMAT',
  ],
  MEDIA: [
    'DOCUMENTO_IDENTIDAD',
    'FOTO',
    'CARNE_EPS',
    'DOCUMENTO_ACUDIENTE',
    'CERTIFICADO_QUINTO_PRIMARIA',
    'CERTIFICADOS_NOTAS_ANTERIORES',
    'PAZ_Y_SALVO_SIMAT',
  ],
};

/**
 * Plazo por defecto (dias) para que el acudiente entregue los documentos y se
 * legalice la matricula de un aspirante aprobado. Secretaria puede fijar otra
 * fecha al aprobar la solicitud; este es solo el valor por omision.
 */
export const DIAS_PLAZO_LEGALIZACION = 15;

export const NOMBRES_DOCUMENTO_MATRICULA: Record<TipoDocumentoMatricula, string> = {
  DOCUMENTO_IDENTIDAD: 'Documento de identidad del estudiante',
  FOTO: 'Foto reciente (3x4)',
  CARNE_EPS: 'Certificado o carné de afiliación a EPS',
  CARNE_VACUNAS: 'Carné de vacunas al día (PAI)',
  CERTIFICADO_CRECIMIENTO_DESARROLLO: 'Certificado de crecimiento y desarrollo',
  CERTIFICADO_AUDIOMETRIA_VISION: 'Certificado de tamizaje visual y auditivo',
  DOCUMENTO_ACUDIENTE: 'Copia de documento del acudiente',
  PAZ_Y_SALVO_SIMAT: 'Constancia de retiro / liberación de SIMAT y paz y salvo',
  CERTIFICADOS_NOTAS_ANTERIORES: 'Certificados de notas de años anteriores (un solo PDF)',
  CERTIFICADO_QUINTO_PRIMARIA: 'Certificado de 5° de básica primaria',
  SERVICIO_SOCIAL_ESTUDIANTIL: 'Constancia de Servicio Social Obligatorio',
  CUSTODIA_LEGAL_O_PODER: 'Custodia legal / patria potestad / poder especial',
  DIAGNOSTICO_MEDICO_INCLUSION: 'Diagnóstico médico / valoración de inclusión (PIAR)',
  CERTIFICADO_GRADO_ANTERIOR: 'Certificado del grado anterior',
  OTRO_DOCUMENTO: 'Otro documento institucional',
};

export const INDICACIONES_DOCUMENTO_MATRICULA: Record<TipoDocumentoMatricula, string> = {
  DOCUMENTO_IDENTIDAD: 'Registro civil legible (menores de 7 años), Tarjeta de Identidad ampliada al 150% (7 a 17 años) o Cédula (mayores de 18).',
  DOCUMENTO_ACUDIENTE: 'Fotocopia legible de la cédula del padre, madre o tutor legal.',
  FOTO: 'Fotografía reciente 3x4 en fondo blanco.',
  CARNE_EPS: 'Certificado de afiliación vigente o carné de salud (no mayor a 30 días de expedición).',
  CARNE_VACUNAS: 'Esquema completo del Programa Ampliado de Inmunizaciones (PAI) con refuerzo de los 5 años.',
  CERTIFICADO_CRECIMIENTO_DESARROLLO: 'Control médico reciente emitido por la EPS o médico tratante.',
  CERTIFICADO_AUDIOMETRIA_VISION: 'Examen preventivo de agudeza visual y tamizaje auditivo.',
  CUSTODIA_LEGAL_O_PODER: 'Soporte legal de custodia, sentencia o poder notarial si el acudiente no es padre ni madre (opcional).',

  PAZ_Y_SALVO_SIMAT: 'Constancia oficial de retiro/liberación en SIMAT y paz y salvo expedido por la institución educativa de procedencia.',
  CERTIFICADOS_NOTAS_ANTERIORES: 'Certificados oficiales de calificaciones de cada uno de los grados cursados a la fecha (en un solo PDF consolidado).',
  CERTIFICADO_QUINTO_PRIMARIA: 'Certificado oficial de culminación y aprobación del ciclo de Básica Primaria (5°).',
  CERTIFICADO_GRADO_ANTERIOR: 'Certificado oficial final de notas y aprobación del grado inmediatamente anterior.',
  SERVICIO_SOCIAL_ESTUDIANTIL: 'Constancia de horas de servicio social obligatorio cursadas en el colegio anterior (exclusivo para 11°).',

  DIAGNOSTICO_MEDICO_INCLUSION: 'Diagnóstico clínico o valoración integral para el Plan Individual de Ajustes Razonables (Decreto 1421).',

  OTRO_DOCUMENTO: 'Documento o soporte adicional solicitado por la institución.',
};

export type CategoriaDocumentoMatricula =
  | 'IDENTIFICACION_SALUD'
  | 'TRAYECTORIA_ACADEMICA'
  | 'INCLUSION_PIAR'
  | 'INSTITUCIONAL';

export const CATEGORIAS_DOCUMENTO_MATRICULA: Record<TipoDocumentoMatricula, CategoriaDocumentoMatricula> = {
  DOCUMENTO_IDENTIDAD: 'IDENTIFICACION_SALUD',
  FOTO: 'IDENTIFICACION_SALUD',
  CARNE_EPS: 'IDENTIFICACION_SALUD',
  CARNE_VACUNAS: 'IDENTIFICACION_SALUD',
  CERTIFICADO_CRECIMIENTO_DESARROLLO: 'IDENTIFICACION_SALUD',
  CERTIFICADO_AUDIOMETRIA_VISION: 'IDENTIFICACION_SALUD',
  DOCUMENTO_ACUDIENTE: 'IDENTIFICACION_SALUD',
  CUSTODIA_LEGAL_O_PODER: 'IDENTIFICACION_SALUD',

  PAZ_Y_SALVO_SIMAT: 'TRAYECTORIA_ACADEMICA',
  CERTIFICADOS_NOTAS_ANTERIORES: 'TRAYECTORIA_ACADEMICA',
  CERTIFICADO_QUINTO_PRIMARIA: 'TRAYECTORIA_ACADEMICA',
  CERTIFICADO_GRADO_ANTERIOR: 'TRAYECTORIA_ACADEMICA',
  SERVICIO_SOCIAL_ESTUDIANTIL: 'TRAYECTORIA_ACADEMICA',

  DIAGNOSTICO_MEDICO_INCLUSION: 'INCLUSION_PIAR',

  OTRO_DOCUMENTO: 'INSTITUCIONAL',
};

export interface GenerarChecklistParams {
  nivel: NivelEducativo;
  numeroGrado?: number;
  tipoIngreso: TipoIngreso;
  tieneDiscapacidad?: boolean;
  parentescoAcudiente?: string;
}

export interface ItemChecklistGenerado {
  tipo_documento: TipoDocumentoMatricula;
  obligatorio: boolean;
  nombre_personalizado?: string;
}

/**
 * Genera el checklist documental preciso e inteligente para un estudiante segun su nivel escolar,
 * grado, tipo de ingreso (antiguo vs nuevo/traslado) y condiciones especiales.
 */
export function generarChecklistMatricula(params: GenerarChecklistParams): ItemChecklistGenerado[] {
  const items: ItemChecklistGenerado[] = [];
  const esNuevoOTraslado = params.tipoIngreso === 'NUEVO' || params.tipoIngreso === 'TRASLADO';

  // 1. Identificación básica y salud transversal a todos los estudiantes
  items.push({ tipo_documento: 'DOCUMENTO_IDENTIDAD', obligatorio: true });
  items.push({ tipo_documento: 'FOTO', obligatorio: true });
  items.push({ tipo_documento: 'CARNE_EPS', obligatorio: true });
  items.push({ tipo_documento: 'DOCUMENTO_ACUDIENTE', obligatorio: true });

  // 2. Requisitos por Ciclo / Nivel Educativo
  if (params.nivel === 'PREESCOLAR') {
    items.push({ tipo_documento: 'CARNE_VACUNAS', obligatorio: true });
    items.push({ tipo_documento: 'CERTIFICADO_CRECIMIENTO_DESARROLLO', obligatorio: true });
    items.push({ tipo_documento: 'CERTIFICADO_AUDIOMETRIA_VISION', obligatorio: true });
  } else if (params.nivel === 'PRIMARIA') {
    // Vacunas obligatorio en primeros grados (refuerzo de 5 años al ingresar a 1°)
    if (params.numeroGrado === undefined || params.numeroGrado <= 2) {
      items.push({ tipo_documento: 'CARNE_VACUNAS', obligatorio: true });
    }
    if (esNuevoOTraslado) {
      items.push({ tipo_documento: 'CERTIFICADOS_NOTAS_ANTERIORES', obligatorio: true });
      items.push({ tipo_documento: 'PAZ_Y_SALVO_SIMAT', obligatorio: true });
    }
  } else if (params.nivel === 'SECUNDARIA') {
    if (esNuevoOTraslado) {
      items.push({ tipo_documento: 'CERTIFICADO_QUINTO_PRIMARIA', obligatorio: true });
      items.push({ tipo_documento: 'CERTIFICADOS_NOTAS_ANTERIORES', obligatorio: true });
      items.push({ tipo_documento: 'PAZ_Y_SALVO_SIMAT', obligatorio: true });
    }
  } else if (params.nivel === 'MEDIA') {
    if (esNuevoOTraslado) {
      items.push({ tipo_documento: 'CERTIFICADO_QUINTO_PRIMARIA', obligatorio: true });
      items.push({ tipo_documento: 'CERTIFICADOS_NOTAS_ANTERIORES', obligatorio: true });
      items.push({ tipo_documento: 'PAZ_Y_SALVO_SIMAT', obligatorio: true });
      // Exclusivo para grado 11° por traslado
      if (params.numeroGrado === 11) {
        items.push({ tipo_documento: 'SERVICIO_SOCIAL_ESTUDIANTIL', obligatorio: true });
      }
    }
  }

  // 3. Casos especiales: Educación Inclusiva (Decreto 1421 de 2017)
  if (params.tieneDiscapacidad) {
    items.push({ tipo_documento: 'DIAGNOSTICO_MEDICO_INCLUSION', obligatorio: true });
  }

  // 4. Casos especiales: Custodia Legal / Poder si el acudiente principal no es Padre ni Madre
  // Se marca como NO OBLIGATORIO por defecto para evitar bloqueos innecesarios en casos familiares
  if (params.parentescoAcudiente && !['PADRE', 'MADRE'].includes(params.parentescoAcudiente.toUpperCase())) {
    items.push({ tipo_documento: 'CUSTODIA_LEGAL_O_PODER', obligatorio: false });
  }

  return items;
}
