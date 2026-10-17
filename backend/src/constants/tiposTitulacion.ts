import { DefinicionCertificado, POLITICA_PREDETERMINADA } from './certificados';

/**
 * Los tipos de documento de titulación (M26) que se ofrecen de partida. Como cualquier tipo son DATOS: nacen en borrador, Secretaría ajusta
 * su texto y el ADMIN los activa. `estados_titulacion` es el candado: solo se expiden con esa situación de titulación del estudiante (M19/M26).
 * Acta de grado y diploma comparten el acta asentada (número, libro y folio); la constancia es para quien aprobó pero aún no se grada.
 */
export const TIPOS_TITULACION: Array<DefinicionCertificado & { nombre: string }> = [
  {
    clave: 'ACTA_GRADO',
    nombre: 'Acta de grado',
    prefijo: 'ACG',
    descripcion: 'Acta individual de grado: número, libro y folio del acta, fecha y título otorgado.',
    estados_matricula: ['MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO', 'RETIRADO'],
    fuentes: ['TITULACION'],
    estados_titulacion: ['GRADUADO', 'GRADUADO_EXTEMPORANEO'],
    variables_obligatorias: ['titulacion.titulo', 'titulacion.acta_codigo', 'titulacion.acta_libro', 'titulacion.acta_folio'],
    politica: structuredClone(POLITICA_PREDETERMINADA),
  },
  {
    clave: 'DIPLOMA_BACHILLER',
    nombre: 'Diploma de bachiller',
    prefijo: 'DIP',
    descripcion: 'Diploma con el título otorgado y el acta de grado en que consta.',
    estados_matricula: ['MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO', 'RETIRADO'],
    fuentes: ['TITULACION'],
    estados_titulacion: ['GRADUADO', 'GRADUADO_EXTEMPORANEO'],
    variables_obligatorias: ['titulacion.titulo', 'titulacion.acta_codigo'],
    politica: structuredClone(POLITICA_PREDETERMINADA),
  },
  {
    clave: 'CONSTANCIA_CULMINACION',
    nombre: 'Constancia de culminación de estudios',
    prefijo: 'CCU',
    descripcion: 'Para quien aprobó el plan de estudios pero tiene pendiente el grado formal por requisitos reglamentarios.',
    estados_matricula: ['MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO', 'RETIRADO'],
    fuentes: ['TITULACION'],
    estados_titulacion: ['APROBO_NO_GRADUADO'],
    variables_obligatorias: ['titulacion.pendientes'],
    politica: structuredClone(POLITICA_PREDETERMINADA),
  },
];
