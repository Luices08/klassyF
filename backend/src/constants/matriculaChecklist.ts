import { NivelEducativo, TipoDocumentoMatricula } from './enums';

/**
 * Checklist documental minimo por nivel educativo (M04). Es un valor
 * institucional fijo hoy, igual que SIEE_WEIGHTS en siee.ts — no configurable
 * por institucion todavia (eso viviria en M32 si se llega a pedir).
 */
export const DOCUMENTOS_REQUERIDOS_POR_NIVEL: Record<NivelEducativo, TipoDocumentoMatricula[]> = {
  PREESCOLAR: ['DOCUMENTO_IDENTIDAD', 'CARNE_VACUNAS', 'FOTO', 'CARNE_EPS'],
  PRIMARIA: ['DOCUMENTO_IDENTIDAD', 'CERTIFICADO_GRADO_ANTERIOR', 'FOTO', 'CARNE_EPS'],
  SECUNDARIA: ['DOCUMENTO_IDENTIDAD', 'CERTIFICADO_GRADO_ANTERIOR', 'FOTO', 'CARNE_EPS'],
  MEDIA: ['DOCUMENTO_IDENTIDAD', 'CERTIFICADO_GRADO_ANTERIOR', 'FOTO', 'CARNE_EPS'],
};

export const NOMBRES_DOCUMENTO_MATRICULA: Record<TipoDocumentoMatricula, string> = {
  DOCUMENTO_IDENTIDAD: 'Documento de identidad',
  CERTIFICADO_GRADO_ANTERIOR: 'Certificado del grado anterior',
  FOTO: 'Foto 3x4',
  CARNE_EPS: 'Carné o afiliación a EPS',
  CARNE_VACUNAS: 'Carné de vacunas',
};
