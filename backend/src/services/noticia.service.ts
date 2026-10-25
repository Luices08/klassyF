import { Types } from 'mongoose';
import { AlcanceNoticia, RolDestinoNoticia, ROLES_DESTINO_NOTICIA, TamanoMosaico } from '../constants/noticias';
import { ROLES } from '../constants/roles';
import Campus from '../models/campus.model';
import CategoriaNoticia from '../models/categoriaNoticia.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import Guardian from '../models/guardian.model';
import Noticia, { NoticiaDocument } from '../models/noticia.model';
import StudentGuardian from '../models/studentGuardian.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { resolverContenidoNoticia } from '../utils/contenidoNoticia';
import { decodificarPortada } from '../utils/portadaNoticia';
import { runTransaction } from '../utils/runTransaction';
import {
  LectorDeNoticias,
  PublicadorDeNoticias,
  alcanceDe,
  estaVigente,
  motivoSinPermiso,
  noticiaAplica,
  ordenarNoticias,
  puedeModerar,
  vencimientoPorDefecto,
} from '../utils/noticias';
import { etiquetaDeGrupo } from '../utils/sabanaCalificaciones';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { registrarEvento } from './audit.service';
import { anioDeTrabajo, gruposDelDocente, ubicacionDeEstudiantes, ubicacionDeGrupos } from './noticiaContexto.service';
import { asegurarCategoriasSembradas } from './noticiaCategoria.service';
import { almacenarPortada } from './noticiaPortada.service';
import { avisarSiCorresponde } from './noticiaAvisos.service';
import { habilitacionActivaDe } from './noticiaHabilitacion.service';

const QUIENES_PUBLICAN = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA, ROLES.DOCENTE];
const LIMITE_LISTA = 200;

const ids = (lista: Array<Types.ObjectId | string>): string[] => lista.map(String);

// --- Quién lee ---

/**
 * Lo que se sabe de quien lee para saber qué le toca: el estudiante, por su matrícula; el acudiente, por la de sus hijos; el docente, por sus clases y las
 * direcciones de grupo (más sus propias sedes); y el personal, por las sedes que tiene asignadas. Todo sale de lo que ya existe: nada se guarda aparte.
 */
export async function lectorDe(usuario: UserDocument): Promise<LectorDeNoticias> {
  const propias = ids(usuario.sedes_ids);
  const base = { rol: usuario.rol, sedes_ids: propias, grados_ids: [] as string[], grupos_ids: [] as string[] };
  const anio = await anioDeTrabajo();
  if (!anio) return base;

  if (usuario.rol === ROLES.ESTUDIANTE) {
    const u = await ubicacionDeEstudiantes([usuario._id], anio._id);
    return { ...base, sedes_ids: u.sedes, grados_ids: u.grados, grupos_ids: u.grupos };
  }
  if (usuario.rol === ROLES.ACUDIENTE) {
    const acudientes = await Guardian.find({ user_id: usuario._id, estado: ESTADO_ACTIVO }).select('_id').lean();
    const vinculos = await StudentGuardian.find({ guardian_id: { $in: acudientes.map((a) => a._id) } }).select('student_id').lean();
    const u = await ubicacionDeEstudiantes(vinculos.map((v) => v.student_id), anio._id);
    return { ...base, sedes_ids: u.sedes, grados_ids: u.grados, grupos_ids: u.grupos };
  }
  if (usuario.rol === ROLES.DOCENTE) {
    const u = await ubicacionDeGrupos(await gruposDelDocente(usuario._id, anio._id));
    return { ...base, sedes_ids: [...new Set([...propias, ...u.sedes])], grados_ids: u.grados, grupos_ids: u.grupos };
  }
  return base;
}

// --- Vistas ---

export interface NoticiaVista {
  id: string;
  titulo: string;
  /** Bajada o entradilla. */
  subtitulo: string;
  /** El texto sin formato; el cuerpo con formato solo viaja en el detalle (`detalleDeNoticia`). */
  descripcion: string;
  categoria: { id: string; nombre: string; tono: string };
  fecha_inicio: Date | null;
  fecha_fin: Date | null;
  hora: string;
  lugar: string;
  afecta_clases: boolean;
  fijada: boolean;
  publicar_desde: Date;
  alcance: AlcanceNoticia;
  /** Versión de la imagen (para el caché del navegador); `null` = sin imagen (solo noticias anteriores a la portada obligatoria). */
  imagen_version: number | null;
  /** Cómo se ve en el mosaico y hacia dónde mira la portada en cada tarjeta. */
  tamano_mosaico: TamanoMosaico;
  enfoque_x: number;
  enfoque_y: number;
  /** Quien la publicó (solo el nombre). */
  autor: string;
}

const vistaPublica = (n: NoticiaDocument, autor = ''): NoticiaVista => ({
  id: String(n._id),
  titulo: n.titulo,
  subtitulo: n.subtitulo ?? '',
  descripcion: n.descripcion,
  categoria: { id: String(n.categoria_id), nombre: n.categoria_nombre, tono: n.categoria_tono },
  fecha_inicio: n.fecha_inicio,
  fecha_fin: n.fecha_fin,
  hora: n.hora,
  lugar: n.lugar,
  afecta_clases: n.afecta_clases,
  fijada: n.fijada,
  publicar_desde: n.publicar_desde,
  alcance: n.alcance,
  imagen_version: n.imagen_version,
  tamano_mosaico: n.tamano_mosaico ?? 'ESTANDAR',
  enfoque_x: n.enfoque_x ?? 50,
  enfoque_y: n.enfoque_y ?? 50,
  autor,
});

/** El nombre de quien publicó cada noticia (solo el nombre: nada más de la persona sale en una noticia). */
async function nombresDeAutores(autores: Array<Types.ObjectId | string>): Promise<Map<string, string>> {
  const usuarios = await User.find({ _id: { $in: [...new Set(autores.map(String))] } }).select('nombre apellido').lean();
  return new Map(usuarios.map((u) => [String(u._id), `${u.nombre} ${u.apellido}`]));
}

/** Lo que ven los lectores: las noticias vigentes que les tocan, fijadas primero y luego los eventos más próximos. */
export async function noticiasParaMi(usuario: UserDocument, limite = 50): Promise<NoticiaVista[]> {
  const ahora = new Date();
  const [vigentes, lector] = await Promise.all([
    Noticia.find({ estado: 'PUBLICADA', publicar_desde: { $lte: ahora }, $or: [{ vence_el: null }, { vence_el: { $gte: ahora } }] }).sort({ publicar_desde: -1 }).limit(LIMITE_LISTA),
    lectorDe(usuario),
  ]);
  const aplicables = vigentes.filter((n) =>
    noticiaAplica({ roles_destino: n.roles_destino, sedes_ids: ids(n.sedes_ids), grados_ids: ids(n.grados_ids), grupos_ids: ids(n.grupos_ids), alcance: n.alcance }, lector)
  );
  const visibles = ordenarNoticias(aplicables, ahora).slice(0, limite);
  const autores = await nombresDeAutores(visibles.map((n) => n.creada_por));
  return visibles.map((n) => vistaPublica(n, autores.get(String(n.creada_por))));
}

export interface NoticiaDetalle extends NoticiaVista {
  estado: string;
  /** El cuerpo con formato, ya limpio. Vacío en las noticias anteriores: ahí se lee `descripcion`. */
  contenido_html: string;
}

/**
 * Una noticia completa con su cuerpo. La ven administración, coordinación y su autor siempre; los demás, solo si está publicada, vigente y les toca (por su perfil, sus
 * grupos y sus sedes). «No existe» y «no te toca» responden igual.
 */
export async function detalleDeNoticia(id: string, usuario: UserDocument): Promise<NoticiaDetalle> {
  const noticia = await cargarNoticia(id);
  if (!puedeModerar(usuario.rol, String(noticia.creada_por) === String(usuario._id))) {
    const lector = noticia.estado === 'PUBLICADA' && estaVigente(noticia, new Date()) ? await lectorDe(usuario) : null;
    const aplica = lector && noticiaAplica({ roles_destino: noticia.roles_destino, sedes_ids: ids(noticia.sedes_ids), grados_ids: ids(noticia.grados_ids), grupos_ids: ids(noticia.grupos_ids), alcance: noticia.alcance }, lector);
    if (!aplica) throw new ApiError(404, 'Noticia no encontrada.');
  }
  const autor = (await nombresDeAutores([noticia.creada_por])).get(String(noticia.creada_por)) ?? '';
  return { ...vistaPublica(noticia, autor), estado: noticia.estado, contenido_html: noticia.contenido_html ?? '' };
}

export interface NoticiaGestion extends NoticiaVista {
  estado: string;
  vigente: boolean;
  /** Está publicada pero aún no le llega la hora (se publicará y avisará sola). */
  programada: boolean;
  vence_el: Date | null;
  roles_destino: RolDestinoNoticia[];
  sedes: Array<{ id: string; nombre: string }>;
  grados: Array<{ id: string; nombre: string }>;
  grupos: Array<{ id: string; nombre: string }>;
  creada_por: string;
  es_mia: boolean;
}

/** Para quien publica: administración y coordinación ven todas (también las archivadas y vencidas); secretaría y docentes, las suyas. */
export async function listarGestion(usuario: UserDocument): Promise<NoticiaGestion[]> {
  if (!QUIENES_PUBLICAN.includes(usuario.rol as (typeof QUIENES_PUBLICAN)[number])) throw new ApiError(403, 'Tu perfil no gestiona noticias.');
  const verTodas = usuario.rol === ROLES.ADMIN || usuario.rol === ROLES.COORDINADOR;
  const noticias = await Noticia.find(verTodas ? {} : { creada_por: usuario._id }).sort({ createdAt: -1 }).limit(LIMITE_LISTA);
  const ahora = new Date();

  const [sedes, grados, grupos, autores] = await Promise.all([
    Campus.find({ _id: { $in: noticias.flatMap((n) => n.sedes_ids) } }).select('nombre').lean(),
    Grade.find({ _id: { $in: noticias.flatMap((n) => n.grados_ids) } }).select('nombre').lean(),
    Group.find({ _id: { $in: noticias.flatMap((n) => n.grupos_ids) } }).select('nomenclatura grade_id').populate<{ grade_id: { nombre: string; numero: number } | null }>('grade_id', 'nombre numero').lean(),
    User.find({ _id: { $in: noticias.map((n) => n.creada_por) } }).select('nombre apellido').lean(),
  ]);
  const nombre = <T extends { _id: Types.ObjectId; nombre?: string }>(lista: T[]) => new Map(lista.map((x) => [String(x._id), x.nombre ?? '']));
  const sedePor = nombre(sedes);
  const gradoPor = nombre(grados);
  const grupoPor = new Map(grupos.map((g) => [String(g._id), etiquetaDeGrupo(g.grade_id?.numero ?? 0, g.grade_id?.nombre ?? '', g.nomenclatura)]));
  const autorPor = new Map(autores.map((a) => [String(a._id), `${a.nombre} ${a.apellido}`]));
  const par = (lista: Types.ObjectId[], mapa: Map<string, string>) => lista.map((i) => ({ id: String(i), nombre: mapa.get(String(i)) ?? '' }));

  return noticias.map((n) => ({
    ...vistaPublica(n, autorPor.get(String(n.creada_por))),
    estado: n.estado,
    vigente: estaVigente(n, ahora),
    programada: n.estado === 'PUBLICADA' && n.publicar_desde > ahora,
    vence_el: n.vence_el,
    roles_destino: n.roles_destino,
    sedes: par(n.sedes_ids, sedePor),
    grados: par(n.grados_ids, gradoPor),
    grupos: par(n.grupos_ids, grupoPor),
    creada_por: autorPor.get(String(n.creada_por)) ?? '',
    es_mia: String(n.creada_por) === String(usuario._id),
  }));
}

// --- Qué puede hacer quien consulta ---

export interface PermisosDeNoticias {
  puede_publicar: boolean;
  /** Hasta dónde llega lo que puede publicar. */
  alcance_maximo: AlcanceNoticia | null;
  /** `null` = todas las categorías. */
  categorias_ids: string[] | null;
  /** Secretaría y docentes por debajo de «toda la institución» deben elegir sede; la pantalla solo ofrece las suyas. */
  sedes_ids: string[] | null;
  /** Gestiona el catálogo de categorías y las habilitaciones de docentes. */
  puede_administrar: boolean;
  puede_fijar: boolean;
}

/** Lo que la pantalla necesita para mostrar (o no) el botón de publicar y sus opciones. La regla la vuelve a comprobar el servidor al publicar. */
export async function permisosDe(usuario: UserDocument): Promise<PermisosDeNoticias> {
  const administra = usuario.rol === ROLES.ADMIN || usuario.rol === ROLES.COORDINADOR || usuario.rol === ROLES.SECRETARIA;
  if (usuario.rol === ROLES.ADMIN || usuario.rol === ROLES.COORDINADOR) {
    return { puede_publicar: true, alcance_maximo: 'INSTITUCION', categorias_ids: null, sedes_ids: null, puede_administrar: true, puede_fijar: true };
  }
  if (usuario.rol === ROLES.SECRETARIA) {
    // Secretaría nunca publica para toda la institución: llega hasta sus sedes (y a los grados y grupos de ellas).
    return { puede_publicar: true, alcance_maximo: 'SEDES', categorias_ids: null, sedes_ids: ids(usuario.sedes_ids), puede_administrar: administra, puede_fijar: false };
  }
  if (usuario.rol === ROLES.DOCENTE) {
    const h = await habilitacionActivaDe(usuario._id);
    if (!h) return { puede_publicar: false, alcance_maximo: null, categorias_ids: null, sedes_ids: null, puede_administrar: false, puede_fijar: false };
    return {
      puede_publicar: true,
      alcance_maximo: h.alcance_maximo,
      categorias_ids: h.categorias_ids.length > 0 ? ids(h.categorias_ids) : null,
      sedes_ids: h.alcance_maximo === 'INSTITUCION' ? null : ids(usuario.sedes_ids),
      puede_administrar: false,
      puede_fijar: false,
    };
  }
  return { puede_publicar: false, alcance_maximo: null, categorias_ids: null, sedes_ids: null, puede_administrar: false, puede_fijar: false };
}

// --- Publicar, editar y archivar ---

export interface DatosNoticia {
  titulo: string;
  subtitulo?: string;
  /** El texto sin formato (la forma anterior de publicar); con `contenido_html`, la descripción se deriva de él. */
  descripcion?: string;
  /** El cuerpo con formato: se limpia aquí y de él sale la descripción. */
  contenido_html?: string;
  tamano_mosaico?: TamanoMosaico;
  enfoque_x?: number;
  enfoque_y?: number;
  /** La portada como data URI (PNG, JPG o WEBP). Obligatoria al crear; al editar solo viaja si se cambia. */
  portada?: string;
  categoria_id: string;
  fecha_inicio?: Date | null;
  fecha_fin?: Date | null;
  hora?: string;
  lugar?: string;
  afecta_clases?: boolean;
  roles_destino?: RolDestinoNoticia[];
  sedes_ids?: string[];
  grados_ids?: string[];
  grupos_ids?: string[];
  publicar_desde?: Date;
  vence_el?: Date | null;
  fijada?: boolean;
}

/** Comprueba que los ids existan y devuelve las sedes de los grupos elegidos (de ahí sale la sede de una noticia por grupos). */
async function resolverAlcance(sedes: string[], grados: string[], grupos: string[]): Promise<{ sedesDeGrupos: string[] }> {
  const unicos = (l: string[]) => [...new Set(l)];
  const [s, g, gr] = await Promise.all([
    sedes.length ? Campus.countDocuments({ _id: { $in: unicos(sedes) } }) : 0,
    grados.length ? Grade.countDocuments({ _id: { $in: unicos(grados) } }) : 0,
    grupos.length ? Group.find({ _id: { $in: unicos(grupos) } }).select('sede_id').lean() : [],
  ]);
  if (s !== unicos(sedes).length) throw new ApiError(400, 'Alguna de las sedes elegidas no existe.');
  if (g !== unicos(grados).length) throw new ApiError(400, 'Alguno de los grados elegidos no existe.');
  if (gr.length !== unicos(grupos).length) throw new ApiError(400, 'Alguno de los grupos elegidos no existe.');
  return { sedesDeGrupos: [...new Set(ids(gr.map((x) => x.sede_id)))] };
}

/** El contexto con el que se decide si alguien puede publicar: su perfil, sus sedes y, si es docente, su habilitación. */
async function publicadorDe(usuario: UserDocument): Promise<PublicadorDeNoticias> {
  const h = usuario.rol === ROLES.DOCENTE ? await habilitacionActivaDe(usuario._id) : null;
  return {
    rol: usuario.rol,
    sedes_ids: ids(usuario.sedes_ids),
    habilitacion: h ? { alcance_maximo: h.alcance_maximo, categorias_ids: ids(h.categorias_ids) } : null,
  };
}

interface AlcanceResuelto {
  sedes_ids: string[];
  grados_ids: string[];
  grupos_ids: string[];
  alcance: AlcanceNoticia;
}

/**
 * Valida alcance y permisos de una noticia con sus valores finales y devuelve el alcance resuelto. Un docente habilitado por debajo de «toda la institución» que no
 * indica sede publica para las suyas. El servidor siempre decide: lo que la pantalla ofrece es solo una ayuda.
 */
export async function validarPublicacion(usuario: UserDocument, d: { categoria_id: string; sedes_ids: string[]; grados_ids: string[]; grupos_ids: string[] }): Promise<AlcanceResuelto> {
  const categoria = await CategoriaNoticia.findById(d.categoria_id).select('estado').lean();
  if (!categoria || categoria.estado === 'inactivo') throw new ApiError(400, 'La categoría elegida no existe o está desactivada.');

  const { sedesDeGrupos } = await resolverAlcance(d.sedes_ids, d.grados_ids, d.grupos_ids);
  const publicador = await publicadorDe(usuario);
  let sedes = d.sedes_ids;
  if (usuario.rol === ROLES.DOCENTE && publicador.habilitacion && publicador.habilitacion.alcance_maximo !== 'INSTITUCION' && d.grupos_ids.length === 0 && sedes.length === 0) sedes = [...publicador.sedes_ids];

  const alcance = alcanceDe({ sedes_ids: sedes, grados_ids: d.grados_ids, grupos_ids: d.grupos_ids });
  const anio = await anioDeTrabajo();
  const dictados = usuario.rol === ROLES.DOCENTE && anio ? new Set(ids(await gruposDelDocente(usuario._id, anio._id))) : new Set<string>();
  const motivo = motivoSinPermiso(publicador, {
    alcance,
    categoria_id: d.categoria_id,
    sedes: sedes.length > 0 ? sedes : sedesDeGrupos,
    grupos_ajenos: d.grupos_ids.filter((g) => !dictados.has(g)).length,
  });
  if (motivo) throw new ApiError(403, motivo);
  return { sedes_ids: sedes, grados_ids: d.grados_ids, grupos_ids: d.grupos_ids, alcance };
}

export function exigirPoderPublicar(usuario: UserDocument): void {
  if (!QUIENES_PUBLICAN.includes(usuario.rol as (typeof QUIENES_PUBLICAN)[number])) throw new ApiError(403, 'Tu perfil no publica noticias.');
}

function exigirPoderFijar(usuario: UserDocument, fijada: boolean | undefined): void {
  if (fijada && usuario.rol !== ROLES.ADMIN && usuario.rol !== ROLES.COORDINADOR) throw new ApiError(403, 'Solo administración y coordinación fijan una noticia.');
}

async function datosDeCategoria(id: string): Promise<{ nombre: string; tono: string }> {
  await asegurarCategoriasSembradas();
  const categoria = await CategoriaNoticia.findById(id).select('nombre tono').lean();
  if (!categoria) throw new ApiError(400, 'La categoría elegida no existe.');
  return { nombre: categoria.nombre, tono: categoria.tono };
}

function exigirFechasCoherentes(inicio: Date | null | undefined, fin: Date | null | undefined): void {
  if (fin && !inicio) throw new ApiError(400, 'Indica cuándo empieza para poder indicar cuándo termina.');
  if (inicio && fin && fin < inicio) throw new ApiError(400, 'La fecha en que termina no puede ser anterior a la de inicio.');
}

function exigirVigenciaCoherente(desde: Date, vence: Date | null): void {
  if (vence && vence < desde) throw new ApiError(400, 'La fecha en que vence no puede ser anterior a la de publicación.');
}

export async function crearNoticia(input: DatosNoticia, usuario: UserDocument, ip?: string | null): Promise<NoticiaGestion> {
  exigirPoderPublicar(usuario);
  exigirPoderFijar(usuario, input.fijada);
  exigirFechasCoherentes(input.fecha_inicio, input.fecha_fin);
  const resuelto = await validarPublicacion(usuario, { categoria_id: input.categoria_id, sedes_ids: input.sedes_ids ?? [], grados_ids: input.grados_ids ?? [], grupos_ids: input.grupos_ids ?? [] });
  const categoria = await datosDeCategoria(input.categoria_id);

  const desde = input.publicar_desde ?? new Date();
  const vence = input.vence_el !== undefined ? input.vence_el : vencimientoPorDefecto(input.fecha_inicio ?? null, input.fecha_fin ?? null);
  exigirVigenciaCoherente(desde, vence);

  // Toda noticia lleva una fotografía de portada: sin ella no se publica (y no hay forma de saltarse la pantalla).
  if (!input.portada) throw new ApiError(400, 'Toda noticia lleva una fotografía de portada.');
  const portada = decodificarPortada(input.portada);
  const contenido = resolverContenidoNoticia({ descripcion: input.descripcion, contenido_html: input.contenido_html });
  const version = Date.now();

  // La noticia y su portada se guardan juntas: o quedan las dos o ninguna.
  const noticia = await runTransaction(async (session) => {
    const [creada] = await Noticia.create(
      [
        {
          titulo: input.titulo,
          subtitulo: input.subtitulo ?? '',
          ...contenido,
          tamano_mosaico: input.tamano_mosaico,
          enfoque_x: input.enfoque_x,
          enfoque_y: input.enfoque_y,
          imagen_version: version,
          categoria_id: input.categoria_id,
          categoria_nombre: categoria.nombre,
          categoria_tono: categoria.tono,
          fecha_inicio: input.fecha_inicio ?? null,
          fecha_fin: input.fecha_fin ?? null,
          hora: input.hora ?? '',
          lugar: input.lugar ?? '',
          afecta_clases: input.afecta_clases ?? false,
          roles_destino: input.roles_destino ?? [...ROLES_DESTINO_NOTICIA],
          ...resuelto,
          publicar_desde: desde,
          vence_el: vence,
          fijada: input.fijada ?? false,
          creada_por: usuario._id,
        },
      ],
      { session }
    );
    await almacenarPortada((creada as NoticiaDocument)._id, portada, usuario._id, version, session);
    return creada as NoticiaDocument;
  });
  await registrarEvento({ usuario_id: usuario._id, accion: 'NOTICIA_CREADA', entidad: 'Noticia', entidad_id: noticia._id, detalle: `${categoria.nombre} · alcance ${resuelto.alcance}`, ip });
  // Si sale ya, se avisa ya; si está programada, la avisa el planificador cuando le llegue la hora.
  await avisarSiCorresponde(noticia._id);
  return (await listarUna(noticia._id, usuario)) as NoticiaGestion;
}

export async function cargarNoticia(id: string): Promise<NoticiaDocument> {
  const noticia = Types.ObjectId.isValid(id) ? await Noticia.findById(id) : null;
  if (!noticia) throw new ApiError(404, 'Noticia no encontrada.');
  return noticia;
}

export async function listarUna(id: Types.ObjectId, usuario: UserDocument): Promise<NoticiaGestion | undefined> {
  return (await listarGestion(usuario)).find((n) => n.id === String(id));
}

export async function actualizarNoticia(id: string, cambios: Partial<DatosNoticia>, usuario: UserDocument, ip?: string | null): Promise<NoticiaGestion> {
  exigirPoderPublicar(usuario);
  const noticia = await cargarNoticia(id);
  if (!puedeModerar(usuario.rol, String(noticia.creada_por) === String(usuario._id))) throw new ApiError(404, 'Noticia no encontrada.');
  if (noticia.estado === 'ARCHIVADA') throw new ApiError(409, 'Una noticia archivada no se edita.');
  exigirPoderFijar(usuario, cambios.fijada);
  exigirFechasCoherentes(cambios.fecha_inicio !== undefined ? cambios.fecha_inicio : noticia.fecha_inicio, cambios.fecha_fin !== undefined ? cambios.fecha_fin : noticia.fecha_fin);

  // Toda noticia lleva portada: una anterior que no la tiene debe recibirla al editarse (fijarla o quitarla de arriba no la exige).
  const portadaNueva = cambios.portada ? decodificarPortada(cambios.portada) : null;
  const soloFijar = Object.keys(cambios).every((k) => k === 'fijada');
  if (!portadaNueva && noticia.imagen_version === null && !soloFijar) throw new ApiError(400, 'Toda noticia lleva una fotografía de portada: sube una para guardar los cambios.');
  const contenido = cambios.contenido_html !== undefined || cambios.descripcion !== undefined ? resolverContenidoNoticia({ descripcion: cambios.descripcion, contenido_html: cambios.contenido_html }) : null;

  const categoriaId = cambios.categoria_id ?? String(noticia.categoria_id);
  const sedes = cambios.sedes_ids ?? ids(noticia.sedes_ids);
  const grados = cambios.grados_ids ?? ids(noticia.grados_ids);
  const grupos = cambios.grupos_ids ?? ids(noticia.grupos_ids);
  // Se vuelve a comprobar el permiso con los valores finales: quien perdió su habilitación ya no puede cambiar su noticia, y nadie la saca de su alcance.
  const resuelto = await validarPublicacion(usuario, { categoria_id: categoriaId, sedes_ids: sedes, grados_ids: grados, grupos_ids: grupos });

  if (cambios.categoria_id) {
    const categoria = await datosDeCategoria(categoriaId);
    noticia.categoria_id = new Types.ObjectId(categoriaId);
    noticia.categoria_nombre = categoria.nombre;
    noticia.categoria_tono = categoria.tono;
  }
  if (cambios.titulo !== undefined) noticia.titulo = cambios.titulo;
  if (cambios.subtitulo !== undefined) noticia.subtitulo = cambios.subtitulo;
  if (contenido) {
    noticia.descripcion = contenido.descripcion;
    noticia.contenido_html = contenido.contenido_html;
  }
  if (cambios.tamano_mosaico !== undefined) noticia.tamano_mosaico = cambios.tamano_mosaico;
  if (cambios.enfoque_x !== undefined) noticia.enfoque_x = cambios.enfoque_x;
  if (cambios.enfoque_y !== undefined) noticia.enfoque_y = cambios.enfoque_y;
  if (portadaNueva) {
    const version = Date.now();
    await almacenarPortada(noticia._id, portadaNueva, usuario._id, version);
    noticia.imagen_version = version;
  }
  if (cambios.fecha_inicio !== undefined) noticia.fecha_inicio = cambios.fecha_inicio;
  if (cambios.fecha_fin !== undefined) noticia.fecha_fin = cambios.fecha_fin;
  if (cambios.hora !== undefined) noticia.hora = cambios.hora;
  if (cambios.lugar !== undefined) noticia.lugar = cambios.lugar;
  if (cambios.afecta_clases !== undefined) noticia.afecta_clases = cambios.afecta_clases;
  if (cambios.roles_destino !== undefined) noticia.roles_destino = cambios.roles_destino;
  if (cambios.publicar_desde !== undefined) noticia.publicar_desde = cambios.publicar_desde;
  if (cambios.vence_el !== undefined) noticia.vence_el = cambios.vence_el;
  else if (cambios.fecha_inicio !== undefined || cambios.fecha_fin !== undefined) noticia.vence_el = vencimientoPorDefecto(noticia.fecha_inicio, noticia.fecha_fin);
  if (cambios.fijada !== undefined) noticia.fijada = cambios.fijada;
  noticia.sedes_ids = resuelto.sedes_ids.map((s) => new Types.ObjectId(s));
  noticia.grados_ids = resuelto.grados_ids.map((g) => new Types.ObjectId(g));
  noticia.grupos_ids = resuelto.grupos_ids.map((g) => new Types.ObjectId(g));
  noticia.alcance = resuelto.alcance;
  exigirVigenciaCoherente(noticia.publicar_desde, noticia.vence_el);
  await noticia.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'NOTICIA_ACTUALIZADA', entidad: 'Noticia', entidad_id: noticia._id, ip });
  // Si se adelantó la hora de una programada, sale (y se avisa) ahora; una ya avisada no se vuelve a avisar.
  if (!noticia.avisada) await avisarSiCorresponde(noticia._id);
  return (await listarUna(noticia._id, usuario)) as NoticiaGestion;
}

/** Una noticia no se borra: se archiva y deja de verse (queda el rastro de qué se comunicó y a quién). El autor siempre puede archivar la suya. */
export async function archivarNoticia(id: string, usuario: UserDocument, ip?: string | null): Promise<void> {
  exigirPoderPublicar(usuario);
  const noticia = await cargarNoticia(id);
  if (!puedeModerar(usuario.rol, String(noticia.creada_por) === String(usuario._id))) throw new ApiError(404, 'Noticia no encontrada.');
  noticia.estado = 'ARCHIVADA';
  noticia.fijada = false;
  await noticia.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'NOTICIA_ARCHIVADA', entidad: 'Noticia', entidad_id: noticia._id, ip });
}
