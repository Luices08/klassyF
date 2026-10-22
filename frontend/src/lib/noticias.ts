import type { AlcanceNoticia, DatosNoticia, Noticia, NoticiaGestion, RolDestinoNoticia, TamanoMosaico } from '../hooks/useNoticias';
import { aInputFechaHora, formatoFechaCalendario, formatoRangoCalendario } from './fechas';

/** De menor a mayor: lo que se habilita a un docente es un máximo en esta escala (lo mismo que `ALCANCES_NOTICIA` del servidor). */
export const ORDEN_ALCANCES: AlcanceNoticia[] = ['GRUPOS', 'GRADOS', 'SEDES', 'INSTITUCION'];

export const alcanceCabeEn = (alcance: AlcanceNoticia, maximo: AlcanceNoticia): boolean => ORDEN_ALCANCES.indexOf(alcance) <= ORDEN_ALCANCES.indexOf(maximo);

export interface FormularioNoticia {
  id: string | null;
  titulo: string;
  /** Bajada o entradilla. */
  subtitulo: string;
  /** El cuerpo con formato (HTML del editor). */
  contenido_html: string;
  tamano_mosaico: TamanoMosaico;
  /** Punto de enfoque de la portada: 0 a 100 desde la esquina superior izquierda. */
  enfoque_x: number;
  enfoque_y: number;
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
  /** La portada nueva (ya reducida, como data URI): viaja al guardar. Al editar solo se llena si se cambia la que tiene. */
  portada: string | null;
  /** El archivo elegido, para mostrar su nombre. */
  portada_archivo: File | null;
  /** Versión de la portada actual, para mostrarla en la edición. */
  imagen_version: number | null;
  fijada: boolean;
}

export const NOTICIA_VACIA: FormularioNoticia = {
  id: null,
  titulo: '',
  subtitulo: '',
  contenido_html: '',
  tamano_mosaico: 'ESTANDAR',
  enfoque_x: 50,
  enfoque_y: 50,
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
  portada: null,
  portada_archivo: null,
  imagen_version: null,
  fijada: false,
};

const escaparHtml = (texto: string): string => texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Un texto sin formato (una noticia anterior) como párrafos del editor: una línea en blanco separa un párrafo de otro. */
export const parrafosDeTexto = (texto: string): string =>
  texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escaparHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

/** El texto de un HTML sin etiquetas: sirve para saber si el cuerpo tiene algo escrito. */
export const textoDeHtml = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const dia = (iso: string | null): string => (iso ? iso.slice(0, 10) : '');

/** Al editar, el cuerpo con formato se pide aparte (los listados no lo traen); una noticia anterior sin formato se abre con su texto en párrafos. */
export function formularioDeNoticia(n: NoticiaGestion, contenidoHtml = ''): FormularioNoticia {
  return {
    id: n.id,
    titulo: n.titulo,
    subtitulo: n.subtitulo,
    contenido_html: contenidoHtml || parrafosDeTexto(n.descripcion),
    tamano_mosaico: n.tamano_mosaico,
    enfoque_x: n.enfoque_x,
    enfoque_y: n.enfoque_y,
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
    portada: null,
    portada_archivo: null,
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
    subtitulo: f.subtitulo.trim(),
    contenido_html: f.contenido_html,
    tamano_mosaico: f.tamano_mosaico,
    enfoque_x: Math.round(f.enfoque_x),
    enfoque_y: Math.round(f.enfoque_y),
    ...(f.portada ? { portada: f.portada } : {}),
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


const FECHA_CORTA = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

/** La fecha que lleva la tarjeta del mosaico: cuándo es el evento o, si no tiene fecha, cuándo se publicó. */
export function fechaDeTarjeta(n: Pick<Noticia, 'fecha_inicio' | 'fecha_fin' | 'hora' | 'publicar_desde'>): string {
  return cuandoEs(n) ?? FECHA_CORTA.format(new Date(n.publicar_desde));
}

/** Lo mismo para la noticia que se está escribiendo (todavía sin publicar: hoy). */
export function fechaDeTarjetaDeFormulario(f: Pick<FormularioNoticia, 'fecha_inicio' | 'fecha_fin' | 'hora'>): string {
  return (
    cuandoEs({ fecha_inicio: f.fecha_inicio ? `${f.fecha_inicio}T00:00:00.000Z` : null, fecha_fin: f.fecha_fin ? `${f.fecha_fin}T00:00:00.000Z` : null, hora: f.hora }) ??
    FECHA_CORTA.format(new Date())
  );
}
