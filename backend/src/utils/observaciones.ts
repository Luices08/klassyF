import { ClaseRegistro, EstadoCompromiso, RolInvolucrado, TipoSituacion } from '../constants/convivencia';
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
}

/**
 * Cómo ve un integrante del personal un registro del Observador; `null` = no lo ve (ni siquiera sabe que existe).
 *  - ADMIN y coordinación de convivencia: todo, incluso anuladas y confidenciales.
 *  - Una observación confidencial solo la leen su autor y orientación.
 *  - Las faltas no las ve el coordinador académico; una Tipo II/III solo la ve completa su autor (el resto, que existe).
 * El acceso al estudiante (sede, grupo que dicta o dirige) lo decide antes `permisoSobreEstudiante`.
 */
export function visibilidadDeObservacion(
  rol: Rol,
  obs: ObservacionParaVisibilidad,
  esAutor: boolean
): 'COMPLETA' | 'RESERVADA' | null {
  if (rol === ROLES.ADMIN || rol === ROLES.COORDINADOR_CONVIVENCIA) return 'COMPLETA';
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
 * Lo que el estudiante ve de su propio observador: las observaciones de los tipos marcados como visibles (nunca las
 * confidenciales). Un estudiante adulto (jornadas nocturna y sabatina) ve además sus faltas Tipo I como titular de sus datos.
 */
export function esVisibleParaEstudiante(obs: ObservacionParaVisibilidad & { visible_estudiante: boolean }, esAdulto: boolean): boolean {
  if (obs.estado !== 'ACTIVA') return false;
  if (obs.clase === 'OBSERVACION') return !obs.confidencial && (esAdulto || obs.visible_estudiante);
  return esAdulto && obs.falta?.gravedad === 'I';
}

// --- Reglas de contenido de una falta (por gravedad) ---

export interface DatosFalta {
  hechos: string;
  version_estudiante?: string;
  compromiso?: string;
  acciones_contencion?: string;
  remitir_comite?: boolean;
  involucrados: { rol: RolInvolucrado }[];
}

/** Una falta Tipo II/III siempre va a convivencia; una Tipo I solo si el docente lo decide. */
export const debeRemitirse = (gravedad: TipoSituacion, remitirComite: boolean | undefined): boolean =>
  esSituacionGrave(gravedad) || Boolean(remitirComite);

/**
 * Qué exige y qué no una falta según su gravedad (el docente no cierra lo grave):
 *  - Tipo I: hechos, y opcionalmente la versión del estudiante y el acuerdo formativo; se queda como antecedente pedagógico.
 *  - Tipo II/III: hechos objetivos, involucrados con su rol y acciones de contención; sin versión ni acuerdo (los descargos y
 *    las medidas son del comité).
 */
export function problemasDeFalta(gravedad: TipoSituacion, d: DatosFalta): string[] {
  const problemas: string[] = [];
  const hay = (texto?: string) => Boolean(texto?.trim());
  if (!hay(d.hechos)) problemas.push('Describe los hechos.');
  if (!d.involucrados.some((i) => i.rol === 'PRESUNTO_RESPONSABLE')) problemas.push('Indica al menos un presunto responsable.');

  if (esSituacionGrave(gravedad)) {
    if ((d.acciones_contencion?.trim().length ?? 0) < 5) problemas.push('Una falta Tipo II o III exige las acciones inmediatas de contención.');
    if (hay(d.version_estudiante) || hay(d.compromiso)) {
      problemas.push('En una falta Tipo II o III la versión del estudiante y el acuerdo los gestiona el comité: no se registran aquí.');
    }
  } else {
    if (hay(d.acciones_contencion)) problemas.push('Las acciones de contención solo se piden en una falta Tipo II o III.');
    if (d.involucrados.some((i) => i.rol !== 'PRESUNTO_RESPONSABLE')) {
      problemas.push('En una falta Tipo I solo se indican los estudiantes que la cometieron.');
    }
  }
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
    return {
      _id: obs._id.toString(),
      fecha_hecho: obs.fecha_hecho,
      periodo_numero: obs.periodo_numero,
      tipo_nombre: tituloDeRegistro(obs),
      descripcion: obs.descripcion,
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
