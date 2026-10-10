/**
 * Catálogo CERRADO de variables que una plantilla de certificado puede usar (`{{clave}}`). Cada una dice de qué módulo sale
 * el dato: la plantilla nunca los crea, solo los coloca en la frase. Una variable nueva es una entrada aquí y su valor en
 * `contextoDeVariables` (`utils/plantillaCertificado.ts`); el editor y la validación la toman de este catálogo.
 */
import { ClaveCertificado } from './certificados';

export interface VariableCertificado {
  clave: string;
  etiqueta: string;
  /** Módulo de origen del dato (se muestra en el editor). */
  origen: string;
  /** Cómo se ve con datos de muestra. */
  ejemplo: string;
  /** Si solo tiene sentido en algunos documentos. */
  solo_en?: ClaveCertificado[];
}

export const VARIABLES_CERTIFICADO: VariableCertificado[] = [
  { clave: 'institucion.nombre', etiqueta: 'Nombre oficial del colegio', origen: 'M01 Institución', ejemplo: 'Colegio de Prueba' },
  { clave: 'institucion.dane', etiqueta: 'Código DANE', origen: 'M01 Institución', ejemplo: '123456789012' },
  { clave: 'institucion.nit', etiqueta: 'NIT', origen: 'M01 Institución', ejemplo: '900.123.456-1' },
  { clave: 'institucion.resolucion', etiqueta: 'Resolución de aprobación', origen: 'M01 Institución', ejemplo: 'Resolución No. 0452 de 15 de noviembre de 2018 expedida por la SED' },
  { clave: 'institucion.ciudad', etiqueta: 'Ciudad o municipio', origen: 'M01 Institución', ejemplo: 'Bogotá D.C.' },
  { clave: 'institucion.departamento', etiqueta: 'Departamento', origen: 'M01 Institución', ejemplo: 'Cundinamarca' },
  { clave: 'sede.nombre', etiqueta: 'Sede', origen: 'M01 Sedes', ejemplo: 'Sede principal' },
  { clave: 'jornada.nombre', etiqueta: 'Jornada', origen: 'M01 Jornadas', ejemplo: 'mañana' },
  { clave: 'jornada.horario', etiqueta: 'Horario regular de la jornada', origen: 'M01 Jornadas', ejemplo: 'de 7:00 a.m. a 1:30 p.m.' },
  { clave: 'estudiante.nombre_completo', etiqueta: 'Apellidos y nombres', origen: 'M03 Estudiantes', ejemplo: 'PÉREZ GÓMEZ ANA MARÍA' },
  { clave: 'estudiante.documento', etiqueta: 'Tipo y número de documento', origen: 'M03 Estudiantes', ejemplo: 'tarjeta de identidad No. 1020304050' },
  { clave: 'estudiante.documento_expedicion', etiqueta: 'Documento con su lugar de expedición', origen: 'M03 Estudiantes', ejemplo: 'tarjeta de identidad No. 1020304050, expedido(a) en Bogotá D.C.' },
  { clave: 'matricula.grado', etiqueta: 'Grado', origen: 'M01 Grados', ejemplo: 'Quinto' },
  { clave: 'matricula.nivel', etiqueta: 'Nivel educativo', origen: 'M01 Grados', ejemplo: 'Básica Primaria' },
  { clave: 'matricula.grupo', etiqueta: 'Grupo', origen: 'M01 Grupos', ejemplo: '5A' },
  { clave: 'anio.numero', etiqueta: 'Año lectivo', origen: 'M05 Año lectivo', ejemplo: '2026' },
  { clave: 'matricula.situacion', etiqueta: '«se encuentra matriculado(a)» o «estuvo matriculado(a)»', origen: 'M04 Matrículas', ejemplo: 'se encuentra matriculado(a)' },
  { clave: 'matricula.clase', etiqueta: 'Clase de matrícula (definitiva o condicional)', origen: 'M04 Matrículas', ejemplo: 'definitiva' },
  { clave: 'matricula.fecha', etiqueta: 'Fecha de legalización de la matrícula', origen: 'M04 Matrículas', ejemplo: '20 de enero de 2026' },
  { clave: 'matricula.registro_libro', etiqueta: 'Asiento en el Libro de Matrícula (folio, libro y número)', origen: 'M04 Matrículas', ejemplo: 'registrada en el Libro de Matrícula bajo el folio L1-F000012-2026 (libro 1, folio 12)', solo_en: ['CERTIFICADO_MATRICULA'] },
  { clave: 'matricula.condicion_ingreso', etiqueta: 'Condición de ingreso', origen: 'M04 Matrículas', ejemplo: 'nuevo(a)' },
  { clave: 'matricula.retiro', etiqueta: 'Aviso de matrícula retirada (vacío si no lo está)', origen: 'M04 Matrículas', ejemplo: 'La matrícula fue retirada; el asiento del Libro de Matrícula se conserva.' },
  { clave: 'acudiente.nombre', etiqueta: 'Acudiente responsable', origen: 'M03 Acudientes', ejemplo: 'LUIS PÉREZ', solo_en: ['CERTIFICADO_MATRICULA'] },
  { clave: 'acudiente.documento', etiqueta: 'Documento del acudiente', origen: 'M03 Acudientes', ejemplo: 'cédula de ciudadanía No. 79000111', solo_en: ['CERTIFICADO_MATRICULA'] },
  { clave: 'acudiente.parentesco', etiqueta: 'Parentesco', origen: 'M03 Acudientes', ejemplo: 'padre', solo_en: ['CERTIFICADO_MATRICULA'] },
  { clave: 'fecha.expedicion', etiqueta: 'Fecha de expedición', origen: 'Sistema', ejemplo: '9 de octubre de 2026' },
  { clave: 'fecha.textual', etiqueta: 'Fecha en fórmula textual', origen: 'Sistema', ejemplo: 'a los nueve (9) días del mes de octubre de 2026' },
  { clave: 'destino.frase', etiqueta: 'Frase del destinatario o motivo elegido', origen: 'Selector al expedir', ejemplo: 'Se expide para presentar ante la Caja de Compensación Familiar' },
  { clave: 'documento.vigencia', etiqueta: 'Vigencia del documento', origen: 'Parámetro de la plantilla', ejemplo: 'treinta (30) días calendario' },
  { clave: 'paz_y_salvo.dependencias', etiqueta: 'Dependencias verificadas', origen: 'Paz y salvo', ejemplo: 'Académica, Biblioteca, Financiera / Administrativa', solo_en: ['PAZ_SALVO'] },
  { clave: 'paz_y_salvo.verificado_por', etiqueta: 'Quién verificó', origen: 'Paz y salvo', ejemplo: 'Laura Gómez', solo_en: ['PAZ_SALVO'] },
  { clave: 'promocion.texto', etiqueta: 'Concepto de promoción', origen: 'M19 Promoción', ejemplo: 'APROBÓ el grado Quinto', solo_en: ['CERTIFICADO_ESTUDIOS'] },
];

export const CLAVES_VARIABLES = new Set(VARIABLES_CERTIFICADO.map((v) => v.clave));
