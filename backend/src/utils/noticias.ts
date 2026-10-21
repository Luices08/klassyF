import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import { ALCANCES_NOTICIA, AlcanceNoticia, RolDestinoNoticia } from '../constants/noticias';
import { finDelDia } from './calendarioAcademico';

/**
 * Reglas puras de las noticias y eventos: hasta dónde llega una noticia, quién puede publicarla y quién la ve. Reciben datos ya resueltos por el servicio (sedes de
 * los grupos, grupos que dicta un docente…) para que cada regla se pueda probar sin base de datos. Es una lista de permitidos: un rol que no aparece, no publica.
 */

export const ETIQUETA_ALCANCE: Record<AlcanceNoticia, string> = {
  GRUPOS: 'sus grupos',
  GRADOS: 'un grado',
  SEDES: 'una sede',
  INSTITUCION: 'toda la institución',
};

/** Lo más específico manda: con grupos es de grupos, con grados de grados, con sedes de sedes y sin nada de toda la institución. */
export function alcanceDe(n: { sedes_ids: readonly string[]; grados_ids: readonly string[]; grupos_ids: readonly string[] }): AlcanceNoticia {
  if (n.grupos_ids.length > 0) return 'GRUPOS';
  if (n.grados_ids.length > 0) return 'GRADOS';
  if (n.sedes_ids.length > 0) return 'SEDES';
  return 'INSTITUCION';
}

/** ¿Una noticia de este alcance cabe dentro del máximo habilitado? */
export const alcanceCabeEn = (alcance: AlcanceNoticia, maximo: AlcanceNoticia): boolean => ALCANCES_NOTICIA.indexOf(alcance) <= ALCANCES_NOTICIA.indexOf(maximo);

// --- Quién publica ---

export interface PublicadorDeNoticias {
  rol: Rol;
  sedes_ids: readonly string[];
  /** La habilitación activa de un docente; `null` si no tiene. */
  habilitacion: { alcance_maximo: AlcanceNoticia; categorias_ids: readonly string[] } | null;
}

export interface PropuestaDeNoticia {
  alcance: AlcanceNoticia;
  categoria_id: string;
  /** Las sedes a las que de verdad llega: las pedidas o, si no hay, las de sus grupos. Vacío = sin sede (toda la institución). */
  sedes: readonly string[];
  /** Cuántos de los grupos pedidos el usuario no dicta ni dirige (solo importa para un docente). */
  grupos_ajenos: number;
}

/**
 * Por qué alguien **no** puede publicar esa noticia, o `null` si puede. Administración y coordinación publican para cualquier alcance; secretaría, solo para sus sedes;
 * un docente, solo dentro de su habilitación (alcance máximo, categorías y, por debajo de «toda la institución», sus propias sedes). El resto de perfiles no publica.
 */
export function motivoSinPermiso(u: PublicadorDeNoticias, p: PropuestaDeNoticia): string | null {
  if (u.rol === ROLES.ADMIN || u.rol === ROLES.COORDINADOR) return null;

  if (u.rol === ROLES.SECRETARIA) {
    if (p.alcance === 'INSTITUCION' || p.sedes.length === 0) return 'Secretaría publica para sus sedes: elige al menos una sede.';
    if (p.sedes.some((s) => !u.sedes_ids.includes(s))) return 'Una de las sedes elegidas no es de las que tienes asignadas.';
    return null;
  }

  if (u.rol === ROLES.DOCENTE) {
    const h = u.habilitacion;
    if (!h) return 'No tienes permiso para publicar noticias. Pídelo a coordinación.';
    if (h.categorias_ids.length > 0 && !h.categorias_ids.includes(p.categoria_id)) return 'Tu permiso no cubre esa categoría.';
    if (!alcanceCabeEn(p.alcance, h.alcance_maximo)) return `Tu permiso llega hasta ${ETIQUETA_ALCANCE[h.alcance_maximo]}.`;
    if (p.alcance === 'GRUPOS' && p.grupos_ajenos > 0) return 'Solo puedes publicar para grupos donde dictas clase o diriges.';
    if (h.alcance_maximo !== 'INSTITUCION' && p.sedes.some((s) => !u.sedes_ids.includes(s))) return 'Solo puedes publicar para tus sedes.';
    return null;
  }

  return 'Tu perfil no publica noticias.';
}

/** Administración y coordinación editan y archivan cualquier noticia; quien la publicó, la suya. */
export function puedeModerar(rol: Rol, esAutor: boolean): boolean {
  return rol === ROLES.ADMIN || rol === ROLES.COORDINADOR || esAutor;
}

/** Quién otorga y quita habilitaciones a docentes. Secretaría solo a docentes de sus sedes (lo comprueba el servicio). */
export const PUEDEN_HABILITAR: readonly Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];

// --- Quién la ve ---

export interface NoticiaParaLector {
  roles_destino: readonly RolDestinoNoticia[];
  sedes_ids: readonly string[];
  grados_ids: readonly string[];
  grupos_ids: readonly string[];
  alcance: AlcanceNoticia;
}

/** Lo que se sabe de quien lee: su perfil y los grupos, grados y sedes en que está (por matrícula, por hijo o por carga docente). */
export interface LectorDeNoticias {
  rol: Rol;
  sedes_ids: readonly string[];
  grados_ids: readonly string[];
  grupos_ids: readonly string[];
}

const cruzan = (a: readonly string[], b: readonly string[]): boolean => a.some((x) => b.includes(x));

const VEN_TODO: readonly Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR];
const PERSONAL_POR_SEDE: readonly Rol[] = [ROLES.SECRETARIA, ROLES.COORDINADOR_CONVIVENCIA, ROLES.ORIENTADOR];

/**
 * ¿Le toca esta noticia a este lector? Administración y coordinación ven todo; secretaría, convivencia y orientación, lo de sus sedes (sin que se les nombre como
 * destinatarios). Docentes, estudiantes y acudientes, lo dirigido a su perfil y que llegue a sus grupos, grados o sedes.
 */
export function noticiaAplica(n: NoticiaParaLector, lector: LectorDeNoticias): boolean {
  if (VEN_TODO.includes(lector.rol)) return true;
  if (PERSONAL_POR_SEDE.includes(lector.rol)) return n.sedes_ids.length === 0 || cruzan(n.sedes_ids, lector.sedes_ids);

  if (!(n.roles_destino as readonly string[]).includes(lector.rol)) return false;
  switch (n.alcance) {
    case 'INSTITUCION':
      return true;
    case 'SEDES':
      return cruzan(n.sedes_ids, lector.sedes_ids);
    case 'GRADOS':
      return cruzan(n.grados_ids, lector.grados_ids) && (n.sedes_ids.length === 0 || cruzan(n.sedes_ids, lector.sedes_ids));
    case 'GRUPOS':
      return cruzan(n.grupos_ids, lector.grupos_ids);
  }
}

// --- Vigencia y orden ---

export interface NoticiaConVigencia {
  estado: string;
  publicar_desde: Date;
  vence_el: Date | null;
}

export const estaVigente = (n: NoticiaConVigencia, ahora: Date): boolean => n.estado === 'PUBLICADA' && n.publicar_desde <= ahora && (!n.vence_el || n.vence_el >= ahora);

/** Cuándo deja de verse una noticia si no se indicó: el último instante (hora de Colombia) del día en que termina el evento; sin evento, no vence. */
export function vencimientoPorDefecto(fechaInicio: Date | null, fechaFin: Date | null): Date | null {
  const ultimo = fechaFin ?? fechaInicio;
  return ultimo ? finDelDia(ultimo) : null;
}

// --- Texto ---

const FORMATO_DIA = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** «25 de octubre» o «25 de octubre al 27 de octubre», con la hora si la hay («, 9:30»); `undefined` si la noticia no tiene fecha. Las fechas son días de calendario (medianoche UTC). */
export function cuandoEsTexto(n: { fecha_inicio: Date | null; fecha_fin: Date | null; hora: string }): string | undefined {
  if (!n.fecha_inicio) return undefined;
  const inicio = FORMATO_DIA.format(n.fecha_inicio);
  const dia = n.fecha_fin && n.fecha_fin.getTime() !== n.fecha_inicio.getTime() ? `${inicio} al ${FORMATO_DIA.format(n.fecha_fin)}` : inicio;
  return n.hora ? `${dia}, ${n.hora}` : dia;
}

export interface NoticiaParaOrdenar {
  fijada: boolean;
  fecha_inicio: Date | null;
  publicar_desde: Date;
}

/**
 * Cómo se lee la lista: primero lo fijado; luego los eventos que vienen, el más próximo primero; y al final las noticias sin fecha o cuyo evento ya empezó, las más
 * recientes primero.
 */
export function ordenarNoticias<T extends NoticiaParaOrdenar>(lista: readonly T[], ahora: Date): T[] {
  const inicioDeHoy = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
  const grupo = (n: T): number => (n.fijada ? 0 : n.fecha_inicio && n.fecha_inicio >= inicioDeHoy ? 1 : 2);
  return [...lista].sort((a, b) => {
    const g = grupo(a) - grupo(b);
    if (g !== 0) return g;
    if (grupo(a) === 1) return (a.fecha_inicio as Date).getTime() - (b.fecha_inicio as Date).getTime();
    return b.publicar_desde.getTime() - a.publicar_desde.getTime();
  });
}
