import { Types } from 'mongoose';
import { ROLES } from '../constants/roles';
import ConfiguracionCertificados from '../models/configuracionCertificados.model';
import Counter from '../models/counter.model';
import Grade from '../models/grade.model';
import LibroCalificaciones, { ILibroCalificaciones, LibroCalificacionesDocument } from '../models/libroCalificaciones.model';
import Campus from '../models/campus.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { hashDeActa } from '../utils/comiteConvivencia';
import { codigoDeLibro, estudiantesQueBloqueanElLibro, rangoDeFolios } from '../utils/libroCalificaciones';
import runTransaction from '../utils/runTransaction';
import { registrarEvento } from './audit.service';
import { cargarAnio } from './configuracionRecuperaciones.service';
import { ContenidoLibro, renderizarLibro } from './libroCalificacionesPdf.service';
import { generarSabana } from './sabanaCalificaciones.service';

const PUEDEN_EMITIR: string[] = [ROLES.ADMIN, ROLES.SECRETARIA];
const PUEDEN_CONSULTAR: string[] = [ROLES.ADMIN, ROLES.SECRETARIA, ROLES.COORDINADOR];

export interface EntradaLibro {
  academic_year_id: string;
  sede_id: string;
  grade_id: string;
}

const noEncontrado = () => new ApiError(404, 'Libro de calificaciones no encontrado.');

/** Secretaría solo trabaja las sedes que tiene asignadas; «no existe» y «no es de tu sede» responden igual. */
function exigirSede(usuario: UserDocument, sedeId: unknown): void {
  if (usuario.rol === ROLES.ADMIN || usuario.rol === ROLES.COORDINADOR) return;
  if (!(usuario.sedes_ids ?? []).some((s) => String(s) === String(sedeId))) throw noEncontrado();
}

const huellaDe = (l: { codigo: string; folio_inicial: number; folio_final: number; snapshot: unknown }): string =>
  hashDeActa({ codigo: l.codigo, folio_inicial: l.folio_inicial, folio_final: l.folio_final, contenido: l.snapshot });

/** Quiénes firman el libro: rectoría y secretaría académica, tal como están designados para los certificados (M26). Sin designar queda la línea en blanco para firma manuscrita. */
async function firmantesDelLibro(): Promise<ContenidoLibro['firmantes']> {
  const config = await ConfiguracionCertificados.findOne().select('rectoria secretaria').lean();
  const nombre = async (id: Types.ObjectId | null | undefined) => {
    const u = id ? await User.findById(id).select('nombre apellido').lean() : null;
    return u ? `${u.nombre} ${u.apellido}` : '';
  };
  return [
    { cargo: config?.rectoria?.cargo || 'Rector(a)', nombre: await nombre(config?.rectoria?.usuario_id) },
    { cargo: config?.secretaria?.cargo || 'Secretario(a) académico(a)', nombre: await nombre(config?.secretaria?.usuario_id) },
  ];
}

/**
 * Emite el libro de calificaciones de un grado en una sede. Solo con el cierre de promoción oficial de TODOS sus estudiantes (un libro no se corrige después),
 * una vez por año, sede y grado. Congela la sábana definitiva, reserva sus folios y su consecutivo en la misma transacción (si algo falla no se consume
 * ningún número) y le pone una huella. Administración y secretaría (esta, de sus sedes).
 */
export async function emitirLibro(entrada: EntradaLibro, usuario: UserDocument, ip?: string | null): Promise<LibroCalificacionesDocument> {
  if (!PUEDEN_EMITIR.includes(usuario.rol)) throw new ApiError(403, 'Solo administración y secretaría emiten el libro de calificaciones.');
  exigirSede(usuario, entrada.sede_id);
  const anio = await cargarAnio(entrada.academic_year_id);
  const [grado, sede] = await Promise.all([Grade.findById(entrada.grade_id).select('nombre').lean(), Campus.findById(entrada.sede_id).select('nombre').lean()]);
  if (!grado || !sede) throw new ApiError(404, 'Grado o sede no encontrados.');

  const vigente = await LibroCalificaciones.findOne({ academic_year_id: anio._id, sede_id: entrada.sede_id, grade_id: entrada.grade_id, estado: 'VIGENTE' }).select('codigo').lean();
  if (vigente) throw new ApiError(409, `Ya hay un libro vigente para ese grado y sede (${vigente.codigo}). Anúlalo con su motivo para emitir otro.`);

  const sabana = await generarSabana({ academic_year_id: entrada.academic_year_id, sede_id: entrada.sede_id, grade_id: entrada.grade_id }, usuario, ip);
  const bloquean = estudiantesQueBloqueanElLibro(sabana.grupos.map((g) => ({ etiqueta: g.grupo.etiqueta, filas: g.filas })));
  const total = sabana.grupos.reduce((s, g) => s + g.filas.length, 0);
  if (total === 0) throw new ApiError(409, 'Ese grado no tiene estudiantes con matrícula activa en el año: no hay nada que consolidar.');
  if (bloquean.length > 0) {
    throw new ApiError(409, `Faltan ${bloquean.length} estudiante(s) con el cierre de promoción oficial y un resultado final (promovido o no promovido).`, { estudiantes: bloquean.slice(0, 20), total: bloquean.length });
  }

  const contenido: ContenidoLibro = {
    institucion: sabana.institucion,
    anio: anio.year,
    grado: grado.nombre,
    sede: sede.nombre,
    generado_en: sabana.generado_en.toISOString(),
    nota_aprobatoria: sabana.nota_aprobatoria,
    mostrar_puesto: sabana.mostrar_puesto,
    grupos: sabana.grupos,
    firmantes: await firmantesDelLibro(),
    total_estudiantes: total,
  };
  // Las hojas del libro no dependen de los dígitos de los folios: se cuentan con unos de prueba y luego se reservan los reales.
  const { paginas } = await renderizarLibro(contenido, { codigo: codigoDeLibro(anio.year, 0), folio_inicial: 1, huella: '0'.repeat(64), anulado: false });
  // Se guarda como JSON plano: así lo que se hashea es exactamente lo que queda en la base.
  const snapshot = JSON.parse(JSON.stringify(contenido)) as unknown;

  const libro = await runTransaction(async (session) => {
    const consecutivo = (await Counter.findByIdAndUpdate(`LIBRO-CAL-${anio.year}`, { $inc: { seq: 1 } }, { new: true, upsert: true, session }))?.seq ?? 1;
    const ultimoFolio = (await Counter.findByIdAndUpdate(`FOLIO-LIBROS-${anio.year}`, { $inc: { seq: paginas } }, { new: true, upsert: true, session }))?.seq ?? paginas;
    const { inicial, final } = rangoDeFolios(ultimoFolio, paginas);
    const codigo = codigoDeLibro(anio.year, consecutivo);
    const datos = { codigo, folio_inicial: inicial, folio_final: final, snapshot };
    const [creado] = await LibroCalificaciones.create(
      [{ academic_year_id: anio._id, sede_id: entrada.sede_id, grade_id: entrada.grade_id, anio: anio.year, consecutivo, ...datos, huella: huellaDe(datos), emitido_por: usuario._id }],
      { session }
    );
    if (!creado) throw new ApiError(500, 'No se pudo emitir el libro.');
    return creado;
  });
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'LIBRO_CALIFICACIONES_EMITIDO',
    entidad: 'LibroCalificaciones',
    entidad_id: libro._id,
    detalle: `${libro.codigo}: folios ${libro.folio_inicial} a ${libro.folio_final}, ${total} estudiante(s)`,
    ip,
  });
  return libro;
}

type DatosDeVista = Pick<ILibroCalificaciones, 'codigo' | 'anio' | 'folio_inicial' | 'folio_final' | 'estado' | 'anulacion' | 'createdAt'> & { _id: unknown };

export const vistaLibro = (l: DatosDeVista, extra: { grado?: string; sede?: string } = {}) => ({
  _id: String(l._id),
  codigo: l.codigo,
  anio: l.anio,
  grado: extra.grado ?? '',
  sede: extra.sede ?? '',
  folio_inicial: l.folio_inicial,
  folio_final: l.folio_final,
  estado: l.estado,
  anulacion: l.anulacion ? { motivo: l.anulacion.motivo, fecha: l.anulacion.fecha } : null,
  fecha_emision: l.createdAt,
});

export async function listarLibros(filtros: { academic_year_id: string }, usuario: UserDocument) {
  if (!PUEDEN_CONSULTAR.includes(usuario.rol)) throw new ApiError(403, 'No tienes acceso al libro de calificaciones.');
  const filtro: Record<string, unknown> = { academic_year_id: filtros.academic_year_id };
  if (usuario.rol === ROLES.SECRETARIA) filtro.sede_id = { $in: usuario.sedes_ids ?? [] };
  const libros = await LibroCalificaciones.find(filtro).select('-snapshot').sort({ consecutivo: 1 }).lean();
  const [grados, sedes] = await Promise.all([
    Grade.find({ _id: { $in: libros.map((l) => l.grade_id) } }).select('nombre').lean(),
    Campus.find({ _id: { $in: libros.map((l) => l.sede_id) } }).select('nombre').lean(),
  ]);
  const gradoPor = new Map(grados.map((g) => [String(g._id), g.nombre]));
  const sedePor = new Map(sedes.map((s) => [String(s._id), s.nombre]));
  return libros.map((l) => vistaLibro(l, { grado: gradoPor.get(String(l.grade_id)), sede: sedePor.get(String(l.sede_id)) }));
}

async function cargar(id: string, usuario: UserDocument): Promise<LibroCalificacionesDocument> {
  if (!PUEDEN_CONSULTAR.includes(usuario.rol)) throw new ApiError(403, 'No tienes acceso al libro de calificaciones.');
  if (!Types.ObjectId.isValid(id)) throw noEncontrado();
  const libro = await LibroCalificaciones.findById(id);
  if (!libro) throw noEncontrado();
  exigirSede(usuario, libro.sede_id);
  return libro;
}

/** ¿El libro guardado sigue siendo el que se emitió? Recalcula la huella con lo que hay en la base. */
export async function verificarIntegridadLibro(id: string, usuario: UserDocument): Promise<{ integro: boolean; codigo: string }> {
  const libro = await cargar(id, usuario);
  return { integro: huellaDe(libro) === libro.huella, codigo: libro.codigo };
}

/** Reimprime el libro desde lo congelado. Se niega si la huella ya no coincide (alguien lo alteró directo en la base). Un libro anulado sale marcado en todas las hojas. */
export async function pdfDeLibro(id: string, usuario: UserDocument, ip?: string | null): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const libro = await cargar(id, usuario);
  if (huellaDe(libro) !== libro.huella) throw new ApiError(409, 'El libro fue alterado después de emitirse: no se imprime. Avisa al administrador.');
  const { buffer } = await renderizarLibro(libro.snapshot as ContenidoLibro, { codigo: libro.codigo, folio_inicial: libro.folio_inicial, huella: libro.huella, anulado: libro.estado === 'ANULADO' });
  await registrarEvento({ usuario_id: usuario._id, accion: 'LIBRO_CALIFICACIONES_DESCARGADO', entidad: 'LibroCalificaciones', entidad_id: libro._id, detalle: libro.codigo, ip });
  return { buffer, nombreArchivo: `libro-calificaciones-${libro.codigo}.pdf` };
}

/** Un libro mal emitido se anula con motivo; sigue verificándose y reimprimiéndose marcado, y sus folios no se reutilizan. */
export async function anularLibro(id: string, motivo: string, usuario: UserDocument, ip?: string | null) {
  if (!PUEDEN_EMITIR.includes(usuario.rol)) throw new ApiError(403, 'Solo administración y secretaría anulan el libro de calificaciones.');
  const libro = await cargar(id, usuario);
  if (libro.estado === 'ANULADO') throw new ApiError(409, 'El libro ya está anulado.');
  libro.estado = 'ANULADO';
  libro.anulacion = { motivo: motivo.trim(), por: usuario._id, fecha: new Date() };
  await libro.save();
  // El motivo queda en el libro; la auditoría solo dice cuál se anuló.
  await registrarEvento({ usuario_id: usuario._id, accion: 'LIBRO_CALIFICACIONES_ANULADO', entidad: 'LibroCalificaciones', entidad_id: libro._id, detalle: libro.codigo, ip });
  return vistaLibro(libro);
}
