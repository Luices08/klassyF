import { createHash } from 'crypto';
import { ClaveDocumentoPiar, EstadoExpediente, TipoExpediente, definicionDocumento } from '../constants/inclusion';

/** Flujo del expediente por tabla (no `if` sueltos). ACTIVO nace al firmar el acta; CERRADO es terminal. */
export const TRANSICIONES_EXPEDIENTE: Record<EstadoExpediente, readonly EstadoExpediente[]> = {
  BORRADOR: ['EN_CONSTRUCCION', 'CERRADO'],
  EN_CONSTRUCCION: ['LISTO_PARA_ACUERDO', 'CERRADO'],
  LISTO_PARA_ACUERDO: ['EN_CONSTRUCCION', 'ACTIVO', 'CERRADO'],
  ACTIVO: ['CERRADO'],
  CERRADO: [],
};

export const puedeTransicionar = (desde: EstadoExpediente, hacia: EstadoExpediente): boolean => TRANSICIONES_EXPEDIENTE[desde].includes(hacia);

const MS_DIA = 24 * 60 * 60 * 1000;

/**
 * Fecha límite para elaborar el PIAR: la norma habla del primer trimestre del año escolar, pero Klassy tiene 2–4 periodos, así que
 * es un plazo en días que fija el colegio, contado desde el inicio del año o desde la matrícula si esta es posterior.
 */
export function fechaLimiteElaboracion(inicioAnio: Date, fechaMatricula: Date | null, dias: number): Date {
  const base = fechaMatricula && fechaMatricula.getTime() > inicioAnio.getTime() ? fechaMatricula : inicioAnio;
  return new Date(base.getTime() + dias * MS_DIA);
}

/** El plazo solo alerta (no bloquea): vence mientras el expediente no esté firmado ni cerrado. */
export const plazoVencido = (fechaLimite: Date | null, estado: EstadoExpediente, ahora: Date): boolean =>
  Boolean(fechaLimite) && estado !== 'ACTIVO' && estado !== 'CERRADO' && ahora.getTime() > (fechaLimite as Date).getTime();

export function edadEnAnios(fechaNacimiento: Date, referencia: Date): number {
  let edad = referencia.getUTCFullYear() - fechaNacimiento.getUTCFullYear();
  const aunNoCumple =
    referencia.getUTCMonth() < fechaNacimiento.getUTCMonth() ||
    (referencia.getUTCMonth() === fechaNacimiento.getUTCMonth() && referencia.getUTCDate() < fechaNacimiento.getUTCDate());
  if (aunNoCumple) edad -= 1;
  return edad;
}

export const esMayorDeEdad = (fechaNacimiento: Date, referencia: Date): boolean => edadEnAnios(fechaNacimiento, referencia) >= 18;

// --- Completitud de los ajustes por asignatura (Anexo 2) ---

export interface AjusteParaCompletitud {
  subject_id: string;
  dba_ids: string[];
  objetivo_flexibilizado: string;
  barrera_asignatura: string;
  ajuste_metodologico: string;
  ajuste_evaluativo: string;
}

const lleno = (texto: string | undefined | null) => Boolean(texto && texto.trim().length > 0);

/** Un ajuste está completo cuando el docente fijó objetivo (DBA o texto), barrera y los dos ajustes que exige el formato. */
export const ajusteCompleto = (a: Omit<AjusteParaCompletitud, 'subject_id'>): boolean =>
  (a.dba_ids.length > 0 || lleno(a.objetivo_flexibilizado)) && lleno(a.barrera_asignatura) && lleno(a.ajuste_metodologico) && lleno(a.ajuste_evaluativo);

export interface AsignaturaEsperada {
  subject_id: string;
  docente_id: string | null;
}

export interface Completitud {
  total: number;
  completas: number;
  porcentaje: number;
  /** Asignaturas del plan sin docente asignado: nadie puede diligenciarlas, coordinación debe asignarlas. */
  sin_docente: string[];
  pendientes: string[];
}

/** Las filas esperadas salen del plan de estudios del grupo (M06) y los docentes de M08; nunca se inventan filas. */
export function completitudDeAjustes(esperadas: AsignaturaEsperada[], ajustes: AjusteParaCompletitud[]): Completitud {
  const hechos = new Set(ajustes.filter((a) => ajusteCompleto(a)).map((a) => a.subject_id));
  const completas = esperadas.filter((e) => hechos.has(e.subject_id)).length;
  return {
    total: esperadas.length,
    completas,
    porcentaje: esperadas.length === 0 ? 0 : Math.round((completas * 100) / esperadas.length),
    sin_docente: esperadas.filter((e) => !e.docente_id).map((e) => e.subject_id),
    pendientes: esperadas.filter((e) => !hechos.has(e.subject_id)).map((e) => e.subject_id),
  };
}

export interface ExpedienteParaAprobar {
  tipo: TipoExpediente;
  consentimiento_otorgado: boolean;
  caracteristicas_completas: boolean;
  /** Plan de apoyo: tiene la necesidad, la observación inicial y al menos una pauta de aula. */
  plan_apoyo_completo: boolean;
  completitud: Completitud;
}

/** Lo que falta para que coordinación pueda aprobar el expediente y emitir el acta. Vacío = se puede aprobar. */
export function pendientesParaAprobar(e: ExpedienteParaAprobar): string[] {
  const falta: string[] = [];
  if (!e.consentimiento_otorgado) falta.push('Falta registrar la autorización del responsable legal para tratar los datos sensibles.');
  if (e.tipo === 'PLAN_APOYO') {
    if (!e.plan_apoyo_completo) falta.push('Faltan la necesidad identificada, la observación inicial y al menos una pauta de aula.');
    return falta;
  }
  if (!e.caracteristicas_completas) falta.push('Faltan las características del estudiante (gustos, qué puede hacer y qué requiere apoyo).');
  if (e.completitud.total === 0) falta.push('El grupo del estudiante no tiene plan de estudios con asignaturas.');
  else if (e.completitud.pendientes.length > 0) falta.push(`Faltan ajustes de ${e.completitud.pendientes.length} de ${e.completitud.total} asignatura(s).`);
  return falta;
}

export const seguimientosFaltantes = (realizados: number, minimo: number): number => Math.max(0, minimo - realizados);

// --- Documentos emitidos ---

export const codigoDeDocumento = (clave: ClaveDocumentoPiar, anio: number, consecutivo: number): string =>
  `${definicionDocumento(clave).prefijo}-${anio}-${String(consecutivo).padStart(4, '0')}`;

/** Huella corta que se imprime en cada hoja para vincular el escaneo firmado con la versión emitida. */
export const huellaCorta = (hash: string): string => hash.slice(0, 12).toUpperCase();

export function huellaDeArchivo(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export type RolFirmanteRequerido = 'ACUDIENTE' | 'ESTUDIANTE';

/** El acta la firma el estudiante si es mayor de edad; si es menor, su acudiente (el estudiante participa pero no la firma solo). */
export const firmanteRequerido = (mayorDeEdad: boolean): RolFirmanteRequerido => (mayorDeEdad ? 'ESTUDIANTE' : 'ACUDIENTE');

/** Documentos que cierran el acuerdo: al firmarse, el expediente pasa a ACTIVO. */
export const CLAVES_QUE_ACTIVAN: readonly ClaveDocumentoPiar[] = ['ACTA_ACUERDO_FAMILIA', 'ACTA_OFICIAL_PIAR', 'PLAN_APOYO'];

const esObjetoPlano = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);

/**
 * Fusiona un cambio parcial sobre una sección: los objetos anidados se fusionan campo a campo (guardar solo `salud.diagnostico_medico`
 * no borra el resto de `salud`) y las listas y los valores simples se reemplazan completos.
 */
export function fusionarSeccion<T extends Record<string, unknown>>(actual: T, cambios: Record<string, unknown>): T {
  const resultado: Record<string, unknown> = { ...actual };
  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor === undefined) continue;
    const previo = resultado[clave];
    resultado[clave] = esObjetoPlano(valor) && esObjetoPlano(previo) ? fusionarSeccion(previo, valor) : valor;
  }
  return resultado as T;
}
