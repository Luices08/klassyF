import { ClaseRegistro, EstadoCompromiso, TipoSituacion } from '../constants/convivencia';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';

const MS_HORA = 3_600_000;

/** true si todavía no pasó el plazo (en horas) desde `desde`. Plazo 0 = ya vencido desde el primer instante. */
export function dentroDelPlazo(desde: Date, horas: number, ahora: Date = new Date()): boolean {
  return ahora.getTime() - desde.getTime() < horas * MS_HORA;
}

/** Faltas Tipo II y III: solo las gestiona convivencia; el director de grupo y orientación ven que existen, no su contenido. */
export const esSituacionGrave = (gravedad: TipoSituacion | null | undefined): boolean => gravedad === 'II' || gravedad === 'III';

// --- Quién ve qué (una sola fuente de verdad para el historial, el detalle y el observador del estudiante) ---

export type ModoVistaObservacion = 'COMPLETA' | 'RESERVADA' | 'ESTUDIANTE';

interface ObservacionParaVisibilidad {
  clase: ClaseRegistro;
  estado: string;
  confidencial: boolean;
  falta: { gravedad: TipoSituacion } | null;
  contexto?: string;
}

/** El seguimiento psicosocial de orientación solo lo lee quien lo escribió (y un ADMIN), igual que las atenciones de una remisión. */
export const esSeguimientoDeOrientacion = (obs: { contexto?: string }): boolean => obs.contexto === 'ORIENTACION';

/**
 * Cómo ve un integrante del personal un registro del Observador; `null` = no lo ve (ni siquiera sabe que existe).
 *  - ADMIN y coordinación de convivencia: todo, incluso anuladas y confidenciales, salvo el seguimiento psicosocial de orientación
 *    (contexto ORIENTACION): ese solo lo leen su autor y el ADMIN.
 *  - Una observación confidencial solo la leen su autor y orientación.
 *  - Las faltas no las ve el coordinador académico; una Tipo II/III solo la ve completa su autor (el resto, que existe).
 * El acceso al estudiante (sede, grupo que dicta o dirige) lo decide antes `permisoSobreEstudiante`.
 */
export function visibilidadDeObservacion(
  rol: Rol,
  obs: ObservacionParaVisibilidad,
  esAutor: boolean
): 'COMPLETA' | 'RESERVADA' | null {
  if (rol === ROLES.ADMIN) return 'COMPLETA';
  if (esSeguimientoDeOrientacion(obs)) return esAutor ? 'COMPLETA' : null;
  if (rol === ROLES.COORDINADOR_CONVIVENCIA) return 'COMPLETA';
  const personal: Rol[] = [ROLES.COORDINADOR, ROLES.ORIENTADOR, ROLES.DOCENTE];
  if (!personal.includes(rol) || obs.estado !== 'ACTIVA') return null;

  if (obs.clase === 'OBSERVACION') {
    if (!obs.confidencial) return 'COMPLETA';
    return esAutor || rol === ROLES.ORIENTADOR ? 'COMPLETA' : null;
  }

  if (rol === ROLES.COORDINADOR || !obs.falta) return null;
  return esSituacionGrave(obs.falta.gravedad) && !esAutor ? 'RESERVADA' : 'COMPLETA';
}

/**
 * Lo que el estudiante ve de su propio observador, sea menor o mayor: las observaciones de los tipos que el colegio marcó como
 * visibles (nunca las confidenciales) y sus faltas. Una Tipo I la ve completa; de una Tipo II/III solo ve que hay un caso de
 * convivencia y en qué estado (el servicio decide si existe uno), porque el caso está en debido proceso e involucra a otros menores.
 */
export function esVisibleParaEstudiante(obs: ObservacionParaVisibilidad & { visible_estudiante: boolean }): boolean {
  if (obs.estado !== 'ACTIVA') return false;
  if (obs.clase === 'OBSERVACION') return !obs.confidencial && obs.visible_estudiante;
  return Boolean(obs.falta);
}

// --- Reglas de contenido de una falta (por gravedad) ---

/** Las faltas Tipo II y III no las tipifica ni las cierra el docente: las reporta como situación urgente y coordinación abre el caso. */
export const MENSAJE_FALTA_GRAVE = 'Una situación de gravedad II o III no se registra como falta: usa el reporte urgente y coordinación de convivencia abre el caso.';

/** Qué exige el registro de una falta Tipo I (antecedente pedagógico): los hechos y, si se escala, nada más. */
export function problemasDeFalta(gravedad: TipoSituacion, d: { hechos: string }): string[] {
  const problemas: string[] = [];
  if (esSituacionGrave(gravedad)) problemas.push(MENSAJE_FALTA_GRAVE);
  if (!d.hechos.trim()) problemas.push('Describe los hechos.');
  return problemas;
}

/** Lo que exige un reporte urgente: hechos, la contención que se tomó en el momento y al menos un estudiante. */
export function problemasDeReporteUrgente(d: { hechos: string; acciones_contencion: string; cantidad_estudiantes: number }): string[] {
  const problemas: string[] = [];
  if (!d.hechos.trim()) problemas.push('Describe los hechos.');
  if (d.acciones_contencion.trim().length < 5) problemas.push('Indica la medida de contención inmediata que tomaste.');
  if (d.cantidad_estudiantes === 0) problemas.push('Indica al menos un estudiante involucrado.');
  return problemas;
}

// --- Vistas ---

interface ObservacionParaVista {
  _id: { toString(): string };
  student_id: { toString(): string };
  clase: ClaseRegistro;
  fecha_hecho: Date;
  periodo_numero: number | null;
  tipo_id: { toString(): string } | null;
  tipo_nombre: string;
  visible_estudiante: boolean;
  requiere_citacion: boolean;
  confidencial: boolean;
  citacion_realizada: { fecha: Date; resultado: string } | null;
  falta: { falta_id: { toString(): string }; codigo: string; descripcion: string; gravedad: TipoSituacion } | null;
  version_estudiante: string;
  solicitud_id: { toString(): string } | null;
  descripcion: string;
  compromiso: string;
  compromiso_estado: EstadoCompromiso | null;
  contexto: string;
  estado: string;
  autor_id: { toString(): string };
  registrado_por: { toString(): string };
  group_id: { toString(): string };
  evento_id: { toString(): string } | null;
  anulacion: { motivo: string; fecha: Date } | null;
  enmiendas: unknown[];
  seguimientos: { _id: { toString(): string }; fecha: Date; nota: string }[];
  createdAt: Date;
}

/** Cómo se rotula un registro: el tipo de la observación, o «Falta <código>». */
export const tituloDeRegistro = (obs: Pick<ObservacionParaVista, 'clase' | 'tipo_nombre' | 'falta'>): string =>
  obs.clase === 'FALTA' ? `Falta ${obs.falta?.codigo ?? ''}`.trim() : obs.tipo_nombre;

/**
 * Lo que cada consultante recibe de un registro. Se arma aquí, en un solo lugar, para que ninguna ruta devuelva el documento
 * crudo: `RESERVADA` oculta el contenido (solo que existe una falta y su gravedad), `ESTUDIANTE` solo el texto final.
 */
export function vistaObservacion(obs: ObservacionParaVista, modo: ModoVistaObservacion) {
  if (modo === 'ESTUDIANTE') {
    const comun = { _id: obs._id.toString(), clase: obs.clase, fecha_hecho: obs.fecha_hecho, periodo_numero: obs.periodo_numero };
    if (obs.clase === 'OBSERVACION') return { ...comun, tipo_nombre: obs.tipo_nombre, descripcion: obs.descripcion };
    // Una falta grave no revela cuál es ni los hechos: solo que existe una situación de convivencia.
    if (esSituacionGrave(obs.falta?.gravedad)) return { ...comun, tipo_nombre: 'Situación de convivencia', gravedad: obs.falta?.gravedad ?? null };
    return {
      ...comun,
      tipo_nombre: tituloDeRegistro(obs),
      gravedad: obs.falta?.gravedad ?? null,
      falta: obs.falta ? { codigo: obs.falta.codigo, descripcion: obs.falta.descripcion } : null,
      descripcion: obs.descripcion,
      version_estudiante: obs.version_estudiante,
      compromiso: obs.compromiso,
    };
  }

  const base = {
    _id: obs._id.toString(),
    student_id: obs.student_id.toString(),
    clase: obs.clase,
    fecha_hecho: obs.fecha_hecho,
    periodo_numero: obs.periodo_numero,
    gravedad: obs.falta?.gravedad ?? null,
    estado: obs.estado,
    createdAt: obs.createdAt,
  };
  if (modo === 'RESERVADA') return { ...base, reservada: true as const };

  return {
    ...base,
    reservada: false as const,
    tipo_id: obs.tipo_id ? obs.tipo_id.toString() : null,
    tipo_nombre: tituloDeRegistro(obs),
    requiere_citacion: obs.requiere_citacion,
    confidencial: obs.confidencial,
    citacion_realizada: obs.citacion_realizada ? { fecha: obs.citacion_realizada.fecha, resultado: obs.citacion_realizada.resultado } : null,
    falta: obs.falta ? { codigo: obs.falta.codigo, descripcion: obs.falta.descripcion, gravedad: obs.falta.gravedad } : null,
    version_estudiante: obs.version_estudiante,
    solicitud_id: obs.solicitud_id ? obs.solicitud_id.toString() : null,
    descripcion: obs.descripcion,
    compromiso: obs.compromiso,
    compromiso_estado: obs.compromiso_estado,
    contexto: obs.contexto,
    autor_id: obs.autor_id.toString(),
    registrado_por: obs.registrado_por.toString(),
    group_id: obs.group_id.toString(),
    evento_id: obs.evento_id ? obs.evento_id.toString() : null,
    anulacion: obs.anulacion ? { motivo: obs.anulacion.motivo, fecha: obs.anulacion.fecha } : null,
    cantidad_enmiendas: obs.enmiendas.length,
    seguimientos: obs.seguimientos.map((s) => ({ _id: s._id.toString(), fecha: s.fecha, nota: s.nota })),
  };
}
