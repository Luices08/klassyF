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
  PAZ_Y_SALVO_ANIO_ANTERIOR: 'Paz y salvo de fin de año (año anterior)',
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
  PAZ_Y_SALVO_ANIO_ANTERIOR:
    'Para quien ya estudió aquí: paz y salvo con la institución al terminar el año anterior. Si ya se confirmó en el módulo «Paz y salvo de fin de año», se aprueba solo.',

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
  PAZ_Y_SALVO_ANIO_ANTERIOR: 'TRAYECTORIA_ACADEMICA',

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
  indicacion?: string;
  categoria?: string;
}

/**
 * Quien llega de otro colegio trae el certificado del grado que acaba de aprobar: el de 5° para entrar a 6° (cierra la
 * primaria), el de 9° para entrar a 10° (cierra la básica) y el del grado inmediatamente anterior en los demás. Para
 * entrar a 1° no se pide certificado de transición, ni si no se conoce el grado.
 */
function certificadoDelGradoAnterior(numeroGrado: number | undefined): ItemChecklistGenerado | null {
  if (numeroGrado === undefined || numeroGrado <= 1) return null;
  if (numeroGrado === 6) return { tipo_documento: 'CERTIFICADO_QUINTO_PRIMARIA', obligatorio: true };
  const anterior = numeroGrado - 1;
  const cierraBasica = anterior === 9 ? ' (cierra la básica secundaria)' : '';
  return {
    tipo_documento: 'CERTIFICADO_GRADO_ANTERIOR',
    obligatorio: true,
    nombre_personalizado: `Certificado de ${anterior}° aprobado${cierraBasica}`,
  };
}

/**
 * Las reglas con que el sistema armaba el checklist antes de ser configurable. YA NO SE USA para matricular: el checklist sale del catálogo
 * (`RequisitoDocumental`, utils/requisitosDocumentales.ts). Se conserva como referencia: la prueba de equivalencia comprueba que el catálogo
 * sembrado pide exactamente lo mismo.
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
      const certificado = certificadoDelGradoAnterior(params.numeroGrado);
      if (certificado) items.push(certificado);
      items.push({ tipo_documento: 'CERTIFICADOS_NOTAS_ANTERIORES', obligatorio: true });
      items.push({ tipo_documento: 'PAZ_Y_SALVO_SIMAT', obligatorio: true });
    }
  } else if (params.nivel === 'SECUNDARIA' || params.nivel === 'MEDIA') {
    if (esNuevoOTraslado) {
      const certificado = certificadoDelGradoAnterior(params.numeroGrado);
      if (certificado) items.push(certificado);
      items.push({ tipo_documento: 'CERTIFICADOS_NOTAS_ANTERIORES', obligatorio: true });
      items.push({ tipo_documento: 'PAZ_Y_SALVO_SIMAT', obligatorio: true });
      // Exclusivo para grado 11° por traslado
      if (params.numeroGrado === 11) {
        items.push({ tipo_documento: 'SERVICIO_SOCIAL_ESTUDIANTIL', obligatorio: true });
      }
    }
  }

  // Quien ya estudió aquí no trae paz y salvo de otro colegio: lo que se le pide es el de fin de año con esta institución.
  if (!esNuevoOTraslado) {
    items.push({ tipo_documento: 'PAZ_Y_SALVO_ANIO_ANTERIOR', obligatorio: true });
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
