import type { AlcanceNoticia, DatosNoticia, Noticia, NoticiaGestion, RolDestinoNoticia } from '../hooks/useNoticias';
import { aInputFechaHora, formatoFechaCalendario, formatoRangoCalendario } from './fechas';

/** De menor a mayor: lo que se habilita a un docente es un máximo en esta escala (lo mismo que `ALCANCES_NOTICIA` del servidor). */
export const ORDEN_ALCANCES: AlcanceNoticia[] = ['GRUPOS', 'GRADOS', 'SEDES', 'INSTITUCION'];

export const alcanceCabeEn = (alcance: AlcanceNoticia, maximo: AlcanceNoticia): boolean => ORDEN_ALCANCES.indexOf(alcance) <= ORDEN_ALCANCES.indexOf(maximo);

export interface FormularioNoticia {
  id: string | null;
  titulo: string;
  descripcion: string;
  categoria_id: string;
  /** `AAAA-MM-DD`, como los campos de fecha. */
  fecha_inicio: string;
  fecha_fin: string;
  hora: string;
  lugar: string;
  afecta_clases: boolean;
  roles_destino: RolDestinoNoticia[];
  alcance: AlcanceNoticia;
  sedes_ids: string[];
  grados_ids: string[];
  grupos_ids: string[];
  vence_el: string;
  /** `AAAA-MM-DDTHH:MM` (hora local) de cuando se publica; vacío = ahora. */
  publicar_desde: string;
  /** Ya salió: su hora de publicación no se cambia (cambiarla no la «reprograma»: ya se avisó). */
  ya_publicada: boolean;
  /** La imagen que se sube al guardar. */
  imagen: File | null;
  /** Tenía una imagen y se quiere quitar al guardar. */
  quitar_imagen: boolean;
  /** Versión de la imagen actual, para mostrarla en la edición. */
  imagen_version: number | null;
  fijada: boolean;
}

export const NOTICIA_VACIA: FormularioNoticia = {
  id: null,
  titulo: '',
  descripcion: '',
  categoria_id: '',
  fecha_inicio: '',
  fecha_fin: '',
  hora: '',
  lugar: '',
  afecta_clases: false,
  roles_destino: ['DOCENTE', 'ESTUDIANTE', 'ACUDIENTE'],
  alcance: 'INSTITUCION',
  sedes_ids: [],
  grados_ids: [],
  grupos_ids: [],
  vence_el: '',
  publicar_desde: '',
  ya_publicada: false,
  imagen: null,
  quitar_imagen: false,
  imagen_version: null,
  fijada: false,
};

const dia = (iso: string | null): string => (iso ? iso.slice(0, 10) : '');

export function formularioDeNoticia(n: NoticiaGestion): FormularioNoticia {
  return {
    id: n.id,
    titulo: n.titulo,
    descripcion: n.descripcion,
    categoria_id: n.categoria.id,
    fecha_inicio: dia(n.fecha_inicio),
    fecha_fin: dia(n.fecha_fin),
    hora: n.hora,
    lugar: n.lugar,
    afecta_clases: n.afecta_clases,
    roles_destino: n.roles_destino,
    alcance: n.alcance,
    sedes_ids: n.sedes.map((s) => s.id),
    grados_ids: n.grados.map((g) => g.id),
    grupos_ids: n.grupos.map((g) => g.id),
    vence_el: dia(n.vence_el),
    // Una programada deja cambiar su hora; una que ya salió no.
    publicar_desde: n.programada ? aInputFechaHora(new Date(n.publicar_desde)) : '',
    ya_publicada: !n.programada,
    imagen: null,
    quitar_imagen: false,
    imagen_version: n.imagen_version,
    fijada: n.fijada,
  };
}

/** Los días de calendario viajan como medianoche UTC, igual que las fechas del año lectivo (M05). */
const aMedianocheUtc = (dia: string): string | null => (dia ? `${dia}T00:00:00.000Z` : null);

/**
 * Lo que se manda al servidor. Solo viaja lo que el alcance elegido usa (con «grados» van también las sedes opcionales; con «grupos», solo los grupos), así cambiar
 * de alcance no deja valores viejos escondidos. Si se deja vacío cuándo vence, el servidor lo calcula con la fecha del evento.
 */
export function datosDeFormulario(f: FormularioNoticia): DatosNoticia {
  return {
    titulo: f.titulo.trim(),
    descripcion: f.descripcion.trim(),
    categoria_id: f.categoria_id,
    fecha_inicio: aMedianocheUtc(f.fecha_inicio),
    fecha_fin: aMedianocheUtc(f.fecha_fin),
    hora: f.hora,
    lugar: f.lugar.trim(),
    afecta_clases: f.afecta_clases,
    roles_destino: f.roles_destino,
    sedes_ids: f.alcance === 'SEDES' || f.alcance === 'GRADOS' ? f.sedes_ids : [],
    grados_ids: f.alcance === 'GRADOS' ? f.grados_ids : [],
    grupos_ids: f.alcance === 'GRUPOS' ? f.grupos_ids : [],
    ...(f.vence_el ? { vence_el: `${f.vence_el}T23:59:59-05:00` } : {}),
    // El campo es de hora local del navegador; viaja como instante. Vacío = sale ahora (y una que ya salió no manda su hora).
    ...(f.publicar_desde && !f.ya_publicada ? { publicar_desde: new Date(f.publicar_desde).toISOString() } : {}),
    fijada: f.fijada,
  };
}

/** «25 may 2026, 9:30» o «25 – 27 may 2026»; vacío si la noticia no tiene fecha. */
export function cuandoEs(n: Pick<Noticia, 'fecha_inicio' | 'fecha_fin' | 'hora'>): string | null {
  if (!n.fecha_inicio) return null;
  const dia = n.fecha_fin && n.fecha_fin !== n.fecha_inicio ? formatoRangoCalendario(n.fecha_inicio, n.fecha_fin) : formatoFechaCalendario(n.fecha_inicio);
  return n.hora ? `${dia}, ${n.hora}` : dia;
}

