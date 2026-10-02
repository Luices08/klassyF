import { HydratedDocument, Types } from 'mongoose';
import {
  ContextoObservacion,
  EstadoCompromiso,
  RolInvolucrado,
} from '../constants/convivencia';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { ROLES } from '../constants/roles';
import AcademicYear, { AcademicYearDocument } from '../models/academicYear.model';
import CasoConvivencia from '../models/casoConvivencia.model';
import Enrollment from '../models/enrollment.model';
import FaltaConvivencia from '../models/faltaConvivencia.model';
import Group, { IGroup } from '../models/group.model';
import Observacion, { IObservacion, ObservacionDocument } from '../models/observacion.model';
import SolicitudCaso, { ISolicitudCaso } from '../models/solicitudCaso.model';
import StudentProfile from '../models/studentProfile.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import TipoObservacion from '../models/tipoObservacion.model';
import { User, UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import {
  debeRemitirse,
  dentroDelPlazo,
  esVisibleParaEstudiante,
  ModoVistaObservacion,
  problemasDeFalta,
  visibilidadDeObservacion,
  vistaObservacion,
} from '../utils/observaciones';
import {
  AccionConvivencia,
  alcanceDeSedes,
  enAlcanceDeSede,
  EstudianteConvivencia,
  permisoSobreEstudiante,
  UsuarioConvivencia,
} from '../utils/permisosConvivencia';
import runTransaction from '../utils/runTransaction';
import { cargarContextoFechas, fechaDeClase, hoyColombia, periodoDeFecha } from './attendance.service';
import { registrarEvento } from './audit.service';
import { obtenerConfiguracion, obtenerInstitucionConvivencia } from './convivenciaCatalogo.service';

const MAYORIA_DE_EDAD = 18;
const LIMITE_BUSQUEDA = 30;
const LIMITE_HISTORIAL = 1000;
const NO_ENCONTRADO = 'Estudiante no encontrado.';

// "No existe" y "no autorizado" responden igual, para no revelar qué estudiantes existen (IDOR).
const estudianteNoEncontrado = () => new ApiError(404, NO_ENCONTRADO);
const observacionNoEncontrada = () => new ApiError(404, 'Observación no encontrada.');

const comoUsuarioConvivencia = (u: UserDocument): UsuarioConvivencia => ({
  id: String(u._id),
  rol: u.rol,
  sedes_ids: u.sedes_ids.map(String),
});

const escaparRegex = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function anioEnCurso() {
  const anio = await AcademicYear.findOne({ estado: 'EN_CURSO' });
  if (!anio) throw new ApiError(409, 'No hay un año lectivo en curso: no se pueden registrar observaciones.');
  return anio;
}

interface ContextoEstudiante {
  student_id: Types.ObjectId;
  enrollment_id: Types.ObjectId;
  grupo: HydratedDocument<IGroup>;
  /** La matrícula es la activa del año en curso (la única sobre la que se registra). */
  vigente: boolean;
  datos: EstudianteConvivencia;
}

/**
 * Matrícula del estudiante sobre la que se decide el acceso: la activa del año en curso; si no la tiene (retirado,
 * graduado, año cerrado) la más reciente, para que coordinación pueda consultar su historial.
 */
async function cargarContextoEstudiante(usuario: UserDocument, studentId: string): Promise<ContextoEstudiante | null> {
  if (!Types.ObjectId.isValid(studentId)) return null;
  const anio = await AcademicYear.findOne({ estado: 'EN_CURSO' });
  const vigente = anio
    ? await Enrollment.findOne({
        student_id: studentId,
        academic_year_id: anio._id,
        estado: { $in: ESTADOS_MATRICULA_ACTIVOS },
      })
    : null;
  const matricula = vigente ?? (await Enrollment.findOne({ student_id: studentId }).sort({ createdAt: -1 }));
  if (!matricula) return null;
  const grupo = await Group.findById(matricula.group_id);
  if (!grupo) return null;

  const esDocente = usuario.rol === ROLES.DOCENTE;
  const docenteDictaClase =
    esDocente &&
    Boolean(
      await TeacherAssignment.exists({
        docente_id: usuario._id,
        group_id: grupo._id,
        academic_year_id: grupo.academic_year_id,
        tipo_asignacion: 'CLASE',
        estado: ESTADO_ACTIVO,
      })
    );
  const esDirectorDeGrupo = esDocente && String(grupo.director_grupo_id) === String(usuario._id);

  return {
    student_id: matricula.student_id,
    enrollment_id: matricula._id,
    grupo,
    vigente: Boolean(vigente),
    datos: { user_id: studentId, sede_id: String(grupo.sede_id), docenteDictaClase, esDirectorDeGrupo },
  };
}

async function exigirPermiso(
  usuario: UserDocument,
  studentId: string,
  accion: AccionConvivencia
): Promise<ContextoEstudiante> {
  const contexto = await cargarContextoEstudiante(usuario, studentId);
  if (!contexto || !permisoSobreEstudiante(comoUsuarioConvivencia(usuario), contexto.datos, accion)) {
    throw estudianteNoEncontrado();
  }
  return contexto;
}

/** Lo usa M15 para decidir si quien gestiona un caso tiene acceso a cada estudiante involucrado (misma regla, mismo 404). */
export const exigirPermisoSobreEstudiante = exigirPermiso;

// --- Buscador acotado (no abre /students) ---

/** Los grupos del año en curso a los que el usuario tiene acceso por su sede o por su vínculo docente. */
async function filtroDeGrupos(usuario: UserDocument, anioId: Types.ObjectId): Promise<Record<string, unknown>> {
  const base = { academic_year_id: anioId, estado: 'ACTIVE' };
  const alcance = alcanceDeSedes(comoUsuarioConvivencia(usuario));
  if (usuario.rol === ROLES.DOCENTE) {
    const clases = await TeacherAssignment.distinct('group_id', {
      docente_id: usuario._id,
      academic_year_id: anioId,
      tipo_asignacion: 'CLASE',
      estado: ESTADO_ACTIVO,
    });
    return { ...base, $or: [{ _id: { $in: clases } }, { director_grupo_id: usuario._id }] };
  }
  return alcance === 'TODAS' ? base : { ...base, sede_id: { $in: alcance } };
}

export async function gruposAccesibles(usuario: UserDocument) {
  const anio = await AcademicYear.findOne({ estado: 'EN_CURSO' });
  if (!anio) return [];
  const grupos = await Group.find(await filtroDeGrupos(usuario, anio._id))
    .populate<{ grade_id: { nombre: string } }>('grade_id', 'nombre')
    .sort({ nomenclatura: 1 });
  return grupos.map((g) => ({
    _id: String(g._id),
    nomenclatura: g.nomenclatura,
    grado: g.grade_id?.nombre ?? '',
    sede_id: String(g.sede_id),
    es_director: String(g.director_grupo_id) === String(usuario._id),
  }));
}

export interface ConsultaEstudiantes {
  group_id?: string;
  q?: string;
}

export async function buscarEstudiantes(usuario: UserDocument, { group_id, q }: ConsultaEstudiantes) {
  const anio = await AcademicYear.findOne({ estado: 'EN_CURSO' });
  if (!anio) return [];
  const texto = q?.trim() ?? '';
  if (!group_id && texto.length < 3) return [];

  const filtroGrupos = await filtroDeGrupos(usuario, anio._id);
  const grupos = await Group.find(group_id ? { $and: [filtroGrupos, { _id: group_id }] } : filtroGrupos).select('nomenclatura');
  if (grupos.length === 0) return [];
  const nomenclatura = new Map(grupos.map((g) => [String(g._id), g.nomenclatura]));

  const filtroMatricula: Record<string, unknown> = {
    group_id: { $in: grupos.map((g) => g._id) },
    estado: { $in: ESTADOS_MATRICULA_ACTIVOS },
  };
  if (texto) {
    const patron = new RegExp(escaparRegex(texto), 'i');
    const coincidentes = await User.find({
      rol: ROLES.ESTUDIANTE,
      $or: [{ nombre: patron }, { apellido: patron }, { numero_documento: patron }],
    })
      .select('_id')
      .limit(200);
    filtroMatricula.student_id = { $in: coincidentes.map((u) => u._id) };
  }

  const matriculas = await Enrollment.find(filtroMatricula)
    .populate<{ student_id: { _id: Types.ObjectId; nombre: string; apellido: string; numero_documento: string } }>(
      'student_id',
      'nombre apellido numero_documento'
    )
    .limit(group_id ? 200 : LIMITE_BUSQUEDA);

  return matriculas
    .filter((m) => m.student_id)
    .map((m) => ({
      student_id: String(m.student_id._id),
      nombre: m.student_id.nombre,
      apellido: m.student_id.apellido,
      numero_documento: m.student_id.numero_documento,
      group_id: String(m.group_id),
      grupo: nomenclatura.get(String(m.group_id)) ?? '',
    }))
    .sort((a, b) => `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`, 'es'));
}

// --- Registro: piezas comunes a observaciones y faltas ---

const vista = (obs: Parameters<typeof vistaObservacion>[0], modo: ModoVistaObservacion) => vistaObservacion(obs, modo);

const ROLES_EN_NOMBRE_DE: string[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.COORDINADOR_CONVIVENCIA];

/** Solo coordinación/ADMIN registran en nombre de un docente (queda quién lo hizo realmente en `registrado_por`). */
async function resolverAutor(usuario: UserDocument, enNombreDeId?: string): Promise<Types.ObjectId> {
  if (!enNombreDeId) return usuario._id;
  if (!ROLES_EN_NOMBRE_DE.includes(usuario.rol)) {
    throw new ApiError(403, 'Solo coordinación o administración pueden registrar en nombre de un docente.');
  }
  const docente = await User.findOne({ _id: enNombreDeId, rol: ROLES.DOCENTE, estado: ESTADO_ACTIVO });
  if (!docente) throw new ApiError(400, 'El docente indicado no existe o está inactivo.');
  return docente._id;
}

function contextoDeRegistro(usuario: UserDocument, datos: EstudianteConvivencia): ContextoObservacion {
  if (usuario.rol === ROLES.ORIENTADOR) return 'ORIENTACION';
  if (usuario.rol !== ROLES.DOCENTE) return 'COORDINACION';
  return datos.docenteDictaClase ? 'CLASE' : 'DIRECCION_GRUPO';
}

function exigirFechaDelHecho(fechaHecho: string): Date {
  const fecha = fechaDeClase(fechaHecho);
  if (fecha > hoyColombia()) throw new ApiError(400, 'La fecha del hecho no puede ser futura.');
  return fecha;
}

interface EstudianteResuelto {
  contexto: ContextoEstudiante;
  periodo: number;
}

/**
 * Cada estudiante debe estar al alcance de quien registra (el servidor decide, no la pantalla), con matrícula activa en el
 * año en curso y la fecha dentro de un periodo. Se valida a todos antes de escribir: o se registra para todos, o para ninguno.
 */
async function resolverEstudiantes(
  usuario: UserDocument,
  estudiantesIds: string[],
  accion: 'REGISTRAR_OBSERVACION' | 'REGISTRAR_FALTA',
  fecha: Date,
  anio: AcademicYearDocument
): Promise<EstudianteResuelto[]> {
  const contextosDeFecha = new Map<string, Awaited<ReturnType<typeof cargarContextoFechas>>>();
  const resueltos: EstudianteResuelto[] = [];
  for (const studentId of estudiantesIds) {
    const contexto = await exigirPermiso(usuario, studentId, accion);
    if (!contexto.vigente || String(contexto.grupo.academic_year_id) !== String(anio._id)) {
      throw new ApiError(409, 'El estudiante no tiene una matrícula activa en el año lectivo en curso.');
    }
    let contextoFechas = contextosDeFecha.get(String(contexto.grupo._id));
    if (!contextoFechas) {
      contextoFechas = await cargarContextoFechas(contexto.grupo);
      contextosDeFecha.set(String(contexto.grupo._id), contextoFechas);
    }
    const periodo = periodoDeFecha(contextoFechas, fecha);
    if (periodo === null) throw new ApiError(400, 'La fecha del hecho no pertenece a ningún periodo del año lectivo.');
    resueltos.push({ contexto, periodo });
  }
  return resueltos;
}

function datosComunes(
  { contexto, periodo }: EstudianteResuelto,
  anio: AcademicYearDocument,
  fecha: Date,
  usuario: UserDocument,
  autorId: Types.ObjectId,
  eventoId: Types.ObjectId | null
): Pick<
  IObservacion,
  | 'student_id'
  | 'enrollment_id'
  | 'group_id'
  | 'sede_id'
  | 'academic_year_id'
  | 'periodo_numero'
  | 'fecha_hecho'
  | 'evento_id'
  | 'registrado_por'
  | 'autor_id'
  | 'contexto'
> {
  return {
    student_id: contexto.student_id,
    enrollment_id: contexto.enrollment_id,
    group_id: contexto.grupo._id,
    sede_id: contexto.grupo.sede_id,
    academic_year_id: anio._id,
    periodo_numero: periodo,
    fecha_hecho: fecha,
    evento_id: eventoId,
    registrado_por: usuario._id,
    autor_id: autorId,
    contexto: contextoDeRegistro(usuario, contexto.datos),
  };
}

const unicos = (ids: string[]) => [...new Set(ids)];

// --- Registro de una observación (M14, cotidiana) ---

export interface RegistrarObservacionInput {
  estudiantes_ids: string[];
  tipo_id: string;
  /** Los hechos, en texto libre. */
  descripcion: string;
  compromiso?: string;
  requiere_citacion?: boolean;
  confidencial?: boolean;
  fecha_hecho: string;
  /** Solo coordinación/ADMIN: el docente al que se atribuye cuando registran por él. */
  en_nombre_de_id?: string;
}

export async function registrarObservacion(input: RegistrarObservacionInput, usuario: UserDocument, ip?: string | null) {
  const descripcion = input.descripcion.trim();
  const compromiso = (input.compromiso ?? '').trim();
  if (!descripcion) throw new ApiError(400, 'Describe los hechos.');

  const anio = await anioEnCurso();
  const fecha = exigirFechaDelHecho(input.fecha_hecho);
  const tipo = Types.ObjectId.isValid(input.tipo_id) ? await TipoObservacion.findById(input.tipo_id) : null;
  if (!tipo || tipo.estado === 'inactivo') throw new ApiError(400, 'El tipo de observación no existe o está inactivo.');

  const autorId = await resolverAutor(usuario, input.en_nombre_de_id);
  // Lo que escribe orientación es seguimiento psicosocial: siempre confidencial, no queda a elección.
  const confidencial = usuario.rol === ROLES.ORIENTADOR ? true : Boolean(input.confidencial);

  const estudiantesIds = unicos(input.estudiantes_ids);
  const eventoId = estudiantesIds.length > 1 ? new Types.ObjectId() : null;
  const resueltos = await resolverEstudiantes(usuario, estudiantesIds, 'REGISTRAR_OBSERVACION', fecha, anio);

  const documentos: Partial<IObservacion>[] = resueltos.map((r) => ({
    ...datosComunes(r, anio, fecha, usuario, autorId, eventoId),
    clase: 'OBSERVACION',
    descripcion,
    compromiso,
    compromiso_estado: compromiso ? 'PENDIENTE' : null,
    tipo_id: tipo._id,
    tipo_nombre: tipo.nombre,
    visible_estudiante: tipo.visible_estudiante,
    requiere_citacion: Boolean(input.requiere_citacion),
    confidencial,
  }));
  const creadas = await runTransaction((session) => Observacion.insertMany(documentos, { session }));

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'OBSERVACION_REGISTRADA',
    entidad: 'Observacion',
    entidad_id: creadas[0]?._id,
    detalle: `${creadas.length} estudiante(s)${eventoId ? `; evento ${eventoId}` : ''}`,
    ip,
  });
  return creadas.map((o) => vista(o, 'COMPLETA'));
}

// --- Registro de una falta (M15: el manual de convivencia, con su gravedad) ---

export interface RegistrarFaltaInput {
  falta_id: string;
  fecha_hecho: string;
  hechos: string;
  /** Tipo I: lo que el estudiante manifestó. */
  version_estudiante?: string;
  /** Tipo I: el acuerdo formativo. */
  compromiso?: string;
  /** Tipo II/III: las acciones inmediatas de contención. */
  acciones_contencion?: string;
  /** Tipo I: el docente decide si la manda al comité. Tipo II/III: siempre va. */
  remitir_comite?: boolean;
  /** Tipo I: los estudiantes (todos presuntos responsables). Tipo II/III: con su rol en el hecho. */
  involucrados: { student_id: string; rol: RolInvolucrado }[];
  en_nombre_de_id?: string;
}

export interface ResultadoFalta {
  registros: ReturnType<typeof vista>[];
  /** true si se generó una solicitud de caso para convivencia. */
  remitida: boolean;
}

/**
 * El docente no tipifica: elige una falta del manual y la gravedad sale de ella. Tipo I se queda en el Observador como
 * antecedente pedagógico; Tipo II/III (o una Tipo I que remite) genera una solicitud para que convivencia abra el caso.
 * El antecedente en el Observador queda solo en los presuntos responsables: el afectado, los testigos y el reportante
 * viven únicamente en la solicitud y el caso (no se estigmatiza a un menor que fue víctima ni se exponen datos de otros).
 */
export async function registrarFalta(input: RegistrarFaltaInput, usuario: UserDocument, ip?: string | null): Promise<ResultadoFalta> {
  const anio = await anioEnCurso();
  const fecha = exigirFechaDelHecho(input.fecha_hecho);
  const institucion = await obtenerInstitucionConvivencia();
  const falta = Types.ObjectId.isValid(input.falta_id)
    ? await FaltaConvivencia.findOne({ _id: input.falta_id, institucion_id: institucion._id, estado: ESTADO_ACTIVO })
    : null;
  if (!falta) throw new ApiError(400, 'La falta no existe o está inactiva.');

  const hechos = input.hechos.trim();
  const problemas = problemasDeFalta(falta.gravedad, { ...input, hechos });
  if (problemas.length > 0) throw new ApiError(400, problemas.join(' '));
  const estudiantesIds = input.involucrados.map((i) => i.student_id);
  if (unicos(estudiantesIds).length !== estudiantesIds.length) {
    throw new ApiError(400, 'Un estudiante no puede figurar dos veces entre los involucrados.');
  }

  const autorId = await resolverAutor(usuario, input.en_nombre_de_id);
  // El docente solo puede nombrar estudiantes de sus grupos (los mismos que ve en el buscador); convivencia agrega el resto al abrir el caso.
  const resueltos = await resolverEstudiantes(usuario, estudiantesIds, 'REGISTRAR_FALTA', fecha, anio);
  const porEstudiante = new Map(input.involucrados.map((i, n) => [i.student_id, { rol: i.rol, resuelto: resueltos[n] as EstudianteResuelto }]));

  const presuntos = input.involucrados.filter((i) => i.rol === 'PRESUNTO_RESPONSABLE');
  const eventoId = presuntos.length > 1 ? new Types.ObjectId() : null;
  const remitida = debeRemitirse(falta.gravedad, input.remitir_comite);
  const solicitudId = remitida ? new Types.ObjectId() : null;
  const compromiso = (input.compromiso ?? '').trim();

  const documentos: (Partial<IObservacion> & { _id: Types.ObjectId })[] = presuntos.map((p) => ({
    ...datosComunes((porEstudiante.get(p.student_id) as { resuelto: EstudianteResuelto }).resuelto, anio, fecha, usuario, autorId, eventoId),
    _id: new Types.ObjectId(),
    clase: 'FALTA',
    descripcion: hechos,
    compromiso,
    compromiso_estado: compromiso ? 'PENDIENTE' : null,
    falta: { falta_id: falta._id, codigo: falta.codigo, descripcion: falta.descripcion, gravedad: falta.gravedad },
    version_estudiante: (input.version_estudiante ?? '').trim(),
    solicitud_id: solicitudId,
  }));
  const observacionDe = new Map(documentos.map((d) => [String(d.student_id), d._id as Types.ObjectId]));

  const primero = (porEstudiante.get((presuntos[0] as { student_id: string }).student_id) as { resuelto: EstudianteResuelto }).resuelto;
  const solicitud: Partial<ISolicitudCaso> | null = solicitudId
    ? {
        _id: solicitudId,
        sede_id: primero.contexto.grupo.sede_id,
        academic_year_id: anio._id,
        fecha_hecho: fecha,
        gravedad: falta.gravedad,
        falta: { falta_id: falta._id, codigo: falta.codigo, descripcion: falta.descripcion },
        hechos,
        acciones_contencion: (input.acciones_contencion ?? '').trim(),
        involucrados: input.involucrados.map((i) => {
          const { resuelto } = porEstudiante.get(i.student_id) as { resuelto: EstudianteResuelto };
          return {
            student_id: resuelto.contexto.student_id,
            rol: i.rol,
            group_id: resuelto.contexto.grupo._id,
            enrollment_id: resuelto.contexto.enrollment_id,
            observacion_id: observacionDe.get(String(resuelto.contexto.student_id)) ?? null,
          };
        }),
        evento_id: eventoId,
        solicitada_por: usuario._id,
      } as unknown as Partial<ISolicitudCaso>
    : null;

  const creadas = await runTransaction(async (session) => {
    if (solicitud) await SolicitudCaso.create([solicitud], { session });
    return Observacion.insertMany(documentos, { session });
  });

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'FALTA_REGISTRADA',
    entidad: 'Observacion',
    entidad_id: creadas[0]?._id,
    detalle: `gravedad ${falta.gravedad}; ${creadas.length} presunto(s) responsable(s)${remitida ? '; remitida a convivencia' : ''}`,
    ip,
  });
  if (solicitudId) {
    await registrarEvento({ usuario_id: usuario._id, accion: 'SOLICITUD_CASO_REGISTRADA', entidad: 'SolicitudCaso', entidad_id: solicitudId, ip });
  }
  return { registros: creadas.map((o) => vista(o, 'COMPLETA')), remitida };
}

// --- Consulta ---

const esAutor = (obs: ObservacionDocument, usuario: UserDocument) =>
  String(obs.autor_id) === String(usuario._id) || String(obs.registrado_por) === String(usuario._id);

async function conNombres<V extends object>(vistas: V[]) {
  const autorDe = (v: V) => (v as { autor_id?: string }).autor_id;
  const ids = new Set<string>();
  for (const v of vistas) {
    const autor = autorDe(v);
    if (autor) ids.add(autor);
  }
  const usuarios = await User.find({ _id: { $in: [...ids] } }).select('nombre apellido');
  const nombre = new Map(usuarios.map((u) => [String(u._id), `${u.nombre} ${u.apellido}`]));
  return vistas.map((v) => {
    const autor = autorDe(v);
    return autor ? { ...v, autor: nombre.get(autor) ?? null } : v;
  });
}

/**
 * Qué pasó con lo que se remitió a convivencia: quien registró ve el estado de su solicitud y, si ya hay un caso, su código y
 * estado (nunca su contenido). Quien ve una falta reservada solo ve el caso.
 */
async function conSeguimientoDeCaso<V extends object>(vistas: V[]) {
  type Campos = { _id: string; reservada?: boolean; solicitud_id?: string | null };
  const campos = (v: V) => v as unknown as Campos;
  const ids = vistas.map((v) => campos(v)._id);
  const solicitudesIds = vistas.flatMap((v) => (campos(v).solicitud_id ? [campos(v).solicitud_id as string] : []));
  if (ids.length === 0) return vistas;
  const [casos, solicitudes] = await Promise.all([
    CasoConvivencia.find({ observacion_ids: { $in: ids } }).select('codigo estado tipo_situacion observacion_ids'),
    solicitudesIds.length ? SolicitudCaso.find({ _id: { $in: solicitudesIds } }).select('estado resolucion') : [],
  ]);
  const solicitudPorId = new Map(solicitudes.map((s) => [String(s._id), s]));
  return vistas.map((v) => {
    const { _id, reservada, solicitud_id } = campos(v);
    const caso = casos.find((c) => c.observacion_ids.some((o) => String(o) === _id));
    const solicitud = !reservada && solicitud_id ? solicitudPorId.get(solicitud_id) : undefined;
    return {
      ...v,
      caso: caso ? { codigo: caso.codigo, estado: caso.estado, tipo_situacion: caso.tipo_situacion } : null,
      ...(reservada ? {} : { solicitud: solicitud ? { estado: solicitud.estado, motivo_resolucion: solicitud.resolucion?.motivo ?? '' } : null }),
    };
  });
}

export interface Paginacion {
  pagina: number;
  limite: number;
}

const porFechaDesc = (a: ObservacionDocument, b: ObservacionDocument) =>
  b.fecha_hecho.getTime() - a.fecha_hecho.getTime() || b.createdAt.getTime() - a.createdAt.getTime();

function paginar<T>(datos: T[], { pagina, limite }: Paginacion) {
  return { total: datos.length, datos: datos.slice((pagina - 1) * limite, pagina * limite) };
}

/**
 * Historial del estudiante: vista derivada del Observador (todos los años). La visibilidad de cada registro la decide
 * `visibilidadDeObservacion`, la misma que usa el detalle: lo que el consultante no puede ver no aparece ni se cuenta.
 */
export async function historialDeEstudiante(
  studentId: string,
  usuario: UserDocument,
  paginacion: Paginacion,
  ip?: string | null
) {
  await exigirPermiso(usuario, studentId, 'CONSULTAR_HISTORIAL');
  const registros = (await Observacion.find({ student_id: studentId }).sort({ fecha_hecho: -1, createdAt: -1 }).limit(LIMITE_HISTORIAL)).sort(porFechaDesc);
  const visibles = registros.flatMap((obs) => {
    const modo = visibilidadDeObservacion(usuario.rol, obs, esAutor(obs, usuario));
    return modo ? [{ obs, modo }] : [];
  });
  const { total, datos } = paginar(visibles, paginacion);

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'CONVIVENCIA_HISTORIAL_CONSULTADO',
    entidad: 'User',
    entidad_id: studentId,
    detalle: `${datos.length} registro(s)`,
    ip,
  });
  const vistas = await conNombres(datos.map(({ obs, modo }) => vista(obs, modo)));
  return { total, ...paginacion, data: await conSeguimientoDeCaso(vistas) };
}

export async function obtenerObservacion(id: string, usuario: UserDocument, ip?: string | null) {
  const obs = Types.ObjectId.isValid(id) ? await Observacion.findById(id) : null;
  if (!obs) throw observacionNoEncontrada();

  let modo: ModoVistaObservacion = 'COMPLETA';
  if (!esAutor(obs, usuario)) {
    await exigirPermiso(usuario, String(obs.student_id), 'CONSULTAR_HISTORIAL').catch(() => {
      throw observacionNoEncontrada();
    });
    const visibilidad = visibilidadDeObservacion(usuario.rol, obs, false);
    if (!visibilidad) throw observacionNoEncontrada();
    modo = visibilidad;
  }

  await registrarEvento({ usuario_id: usuario._id, accion: 'CONVIVENCIA_HISTORIAL_CONSULTADO', entidad: 'Observacion', entidad_id: obs._id, ip });
  const [detalle] = await conSeguimientoDeCaso(await conNombres([vista(obs, modo)]));
  return detalle;
}

/** Lo que el propio usuario registró (el docente no consulta el Observador de otros: solo ve lo suyo). */
export async function misObservaciones(usuario: UserDocument, paginacion: Paginacion) {
  const propios = (await Observacion.find({ $or: [{ autor_id: usuario._id }, { registrado_por: usuario._id }] }).sort({ fecha_hecho: -1, createdAt: -1 }).limit(LIMITE_HISTORIAL)).sort(porFechaDesc);
  const { total, datos } = paginar(propios, paginacion);
  const estudiantes = await User.find({ _id: { $in: datos.map((o) => o.student_id) } }).select('nombre apellido');
  const nombre = new Map(estudiantes.map((u) => [String(u._id), `${u.apellido} ${u.nombre}`]));
  const vistas = await conSeguimientoDeCaso(datos.map((o) => ({ ...vista(o, 'COMPLETA'), estudiante: nombre.get(String(o.student_id)) ?? '' })));
  return { total, ...paginacion, data: vistas };
}

async function esMayorDeEdad(studentId: Types.ObjectId): Promise<boolean> {
  const perfil = await StudentProfile.findOne({ user_id: studentId }).select('fecha_nacimiento');
  if (!perfil) return false;
  const limite = new Date(perfil.fecha_nacimiento);
  limite.setUTCFullYear(limite.getUTCFullYear() + MAYORIA_DE_EDAD);
  return limite <= new Date();
}

/** El estudiante ve solo lo suyo y solo el texto final (ver `esVisibleParaEstudiante` para qué entra). */
export async function miObservador(usuario: UserDocument, ip?: string | null) {
  if (usuario.rol !== ROLES.ESTUDIANTE) throw new ApiError(403, 'Solo un estudiante consulta su propio observador.');
  const adulto = await esMayorDeEdad(usuario._id);
  const registros = (await Observacion.find({ student_id: usuario._id, estado: 'ACTIVA' }).sort({ fecha_hecho: -1, createdAt: -1 }).limit(LIMITE_HISTORIAL)).sort(porFechaDesc);
  const visibles = registros.filter((o) => esVisibleParaEstudiante(o, adulto)).slice(0, 200);

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'CONVIVENCIA_OBSERVACIONES_PROPIAS_CONSULTADAS',
    entidad: 'User',
    entidad_id: usuario._id,
    detalle: `${visibles.length} registro(s)`,
    ip,
  });
  return visibles.map((o) => vista(o, 'ESTUDIANTE'));
}

// --- Enmienda y anulación ---

async function exigirAnioNoCerrado(obs: ObservacionDocument) {
  const anio = await AcademicYear.findById(obs.academic_year_id);
  if (anio?.estado === 'CERRADO') throw new ApiError(409, 'El año lectivo está cerrado: el registro es solo de lectura.');
}

/**
 * Quién puede corregir un registro: su autor dentro del plazo configurable; coordinación de convivencia (de sus sedes) y
 * ADMIN sin plazo; el coordinador académico las observaciones comunes de su sede. Una falta que ya se remitió a convivencia
 * solo la corrige convivencia. Nunca en un año cerrado.
 */
async function cargarParaCorregir(
  id: string,
  usuario: UserDocument,
  plazoHoras: (c: { plazo_enmienda_horas: number; plazo_anulacion_horas: number }) => number
) {
  const obs = Types.ObjectId.isValid(id) ? await Observacion.findById(id) : null;
  if (!obs) throw observacionNoEncontrada();

  const conv = comoUsuarioConvivencia(usuario);
  const convivencia =
    usuario.rol === ROLES.ADMIN || (usuario.rol === ROLES.COORDINADOR_CONVIVENCIA && enAlcanceDeSede(conv, String(obs.sede_id)));
  const coordinadorAcademico =
    usuario.rol === ROLES.COORDINADOR &&
    enAlcanceDeSede(conv, String(obs.sede_id)) &&
    obs.clase === 'OBSERVACION' &&
    !obs.confidencial;
  const autor = esAutor(obs, usuario);
  if (!convivencia && !coordinadorAcademico && !autor) throw observacionNoEncontrada();

  if (obs.estado === 'ANULADA') throw new ApiError(409, 'El registro está anulado y no se puede modificar.');
  await exigirAnioNoCerrado(obs);
  if (obs.solicitud_id && !convivencia) {
    throw new ApiError(409, 'La falta ya se remitió a convivencia: solicita la corrección a coordinación de convivencia.');
  }

  if (!convivencia && !coordinadorAcademico) {
    const configuracion = await obtenerConfiguracion();
    if (!dentroDelPlazo(obs.createdAt, plazoHoras(configuracion))) {
      throw new ApiError(403, 'Venció el plazo para modificar tu registro; solicítalo a coordinación.');
    }
  }
  return obs;
}

export interface EnmendarObservacionInput {
  descripcion?: string;
  compromiso?: string;
  /** Solo observaciones. */
  requiere_citacion?: boolean;
  confidencial?: boolean;
  /** Solo faltas Tipo I. */
  version_estudiante?: string;
}

export async function enmendarObservacion(
  id: string,
  input: EnmendarObservacionInput,
  usuario: UserDocument,
  ip?: string | null
) {
  const obs = await cargarParaCorregir(id, usuario, (c) => c.plazo_enmienda_horas);

  const esFalta = obs.clase === 'FALTA';
  const esFaltaGrave = esFalta && obs.falta?.gravedad !== 'I';
  if (esFalta && (input.requiere_citacion !== undefined || input.confidencial !== undefined)) {
    throw new ApiError(400, 'Una falta no usa citación ni confidencialidad.');
  }
  if (!esFalta && input.version_estudiante !== undefined) throw new ApiError(400, 'La versión del estudiante solo aplica a una falta Tipo I.');
  if (esFaltaGrave && (input.compromiso !== undefined || input.version_estudiante !== undefined)) {
    throw new ApiError(400, 'En una falta Tipo II o III la versión del estudiante y el acuerdo los gestiona el comité.');
  }
  if (obs.confidencial && usuario.rol === ROLES.ORIENTADOR && input.confidencial === false) {
    throw new ApiError(400, 'El seguimiento de orientación es siempre confidencial.');
  }

  const descripcion = input.descripcion !== undefined ? input.descripcion.trim() : obs.descripcion;
  if (!descripcion) throw new ApiError(400, 'Describe los hechos.');
  const compromiso = input.compromiso !== undefined ? input.compromiso.trim() : obs.compromiso;

  obs.enmiendas.push({
    fecha: new Date(),
    por: usuario._id,
    descripcion_anterior: obs.descripcion,
    compromiso_anterior: obs.compromiso,
    version_estudiante_anterior: obs.version_estudiante,
  });
  obs.descripcion = descripcion;
  if (compromiso !== obs.compromiso) {
    obs.compromiso = compromiso;
    // Un compromiso nuevo arranca pendiente; si se borra, no hay nada que hacer seguimiento.
    obs.compromiso_estado = compromiso ? (obs.compromiso_estado ?? 'PENDIENTE') : null;
  }
  if (input.requiere_citacion !== undefined) obs.requiere_citacion = input.requiere_citacion;
  if (input.confidencial !== undefined) obs.confidencial = input.confidencial;
  if (input.version_estudiante !== undefined) obs.version_estudiante = input.version_estudiante.trim();
  await obs.save();

  await registrarEvento({ usuario_id: usuario._id, accion: 'OBSERVACION_ENMENDADA', entidad: 'Observacion', entidad_id: obs._id, ip });
  return vista(obs, 'COMPLETA');
}

export async function anularObservacion(id: string, motivo: string, usuario: UserDocument, ip?: string | null) {
  const obs = await cargarParaCorregir(id, usuario, (c) => c.plazo_anulacion_horas);
  obs.estado = 'ANULADA';
  obs.anulacion = { motivo: motivo.trim(), por: usuario._id, fecha: new Date() };
  await obs.save();

  // El motivo es texto libre: queda en el registro, no en la auditoría.
  await registrarEvento({ usuario_id: usuario._id, accion: 'OBSERVACION_ANULADA', entidad: 'Observacion', entidad_id: obs._id, ip });
  return vista(obs, 'COMPLETA');
}

// --- Seguimiento: cumplimiento del compromiso, citación realizada y notas ---

/**
 * El seguimiento lo registran quien escribió el registro, el director del grupo, coordinación y orientación, cada uno solo sobre
 * lo que puede ver. No tiene plazo, pero tampoco se hace sobre un registro anulado ni con el año cerrado.
 */
async function cargarParaSeguimiento(id: string, usuario: UserDocument) {
  const obs = Types.ObjectId.isValid(id) ? await Observacion.findById(id) : null;
  if (!obs) throw observacionNoEncontrada();

  const conv = comoUsuarioConvivencia(usuario);
  const enSede = enAlcanceDeSede(conv, String(obs.sede_id));
  const autor = esAutor(obs, usuario);
  let permitido = autor || usuario.rol === ROLES.ADMIN;
  if (!permitido && enSede) {
    if (usuario.rol === ROLES.COORDINADOR_CONVIVENCIA) permitido = true;
    else if (usuario.rol === ROLES.ORIENTADOR) permitido = visibilidadDeObservacion(usuario.rol, obs, false) === 'COMPLETA';
    else if (usuario.rol === ROLES.COORDINADOR) permitido = obs.clase === 'OBSERVACION' && !obs.confidencial;
  }
  if (!permitido && usuario.rol === ROLES.DOCENTE) {
    const grupo = await Group.findById(obs.group_id).select('director_grupo_id');
    permitido = String(grupo?.director_grupo_id) === String(usuario._id) && visibilidadDeObservacion(usuario.rol, obs, false) === 'COMPLETA';
  }
  if (!permitido) throw observacionNoEncontrada();

  if (obs.estado === 'ANULADA') throw new ApiError(409, 'El registro está anulado y no se puede modificar.');
  await exigirAnioNoCerrado(obs);
  return obs;
}

export async function agregarSeguimiento(id: string, nota: string, usuario: UserDocument, ip?: string | null) {
  const obs = await cargarParaSeguimiento(id, usuario);
  obs.seguimientos.push({ fecha: new Date(), nota: nota.trim(), por: usuario._id });
  await obs.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'SEGUIMIENTO_OBSERVACION_REGISTRADO', entidad: 'Observacion', entidad_id: obs._id, ip });
  return vista(obs, 'COMPLETA');
}

export async function marcarCompromiso(
  id: string,
  estado: Exclude<EstadoCompromiso, 'PENDIENTE'>,
  nota: string | undefined,
  usuario: UserDocument,
  ip?: string | null
) {
  const obs = await cargarParaSeguimiento(id, usuario);
  if (obs.compromiso_estado !== 'PENDIENTE') {
    throw new ApiError(409, obs.compromiso_estado ? 'El compromiso ya fue cerrado.' : 'Este registro no tiene compromiso.');
  }
  obs.compromiso_estado = estado;
  if (nota?.trim()) obs.seguimientos.push({ fecha: new Date(), nota: `Compromiso ${estado === 'CUMPLIDO' ? 'cumplido' : 'incumplido'}: ${nota.trim()}`, por: usuario._id });
  await obs.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'COMPROMISO_OBSERVACION_CERRADO', entidad: 'Observacion', entidad_id: obs._id, detalle: estado, ip });
  return vista(obs, 'COMPLETA');
}

/** Solo se registra que se citó (cuándo y con qué resultado): el envío de avisos es de M28. */
export async function registrarCitacionRealizada(
  id: string,
  datos: { fecha: string; resultado?: string },
  usuario: UserDocument,
  ip?: string | null
) {
  const obs = await cargarParaSeguimiento(id, usuario);
  if (!obs.requiere_citacion) throw new ApiError(409, 'Este registro no indica que se deba citar al acudiente.');
  if (obs.citacion_realizada) throw new ApiError(409, 'La citación ya quedó registrada.');
  const fecha = fechaDeClase(datos.fecha);
  if (fecha > hoyColombia()) throw new ApiError(400, 'La fecha de la citación no puede ser futura.');

  obs.citacion_realizada = { fecha, resultado: (datos.resultado ?? '').trim(), por: usuario._id };
  await obs.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'CITACION_OBSERVACION_REGISTRADA', entidad: 'Observacion', entidad_id: obs._id, ip });
  return vista(obs, 'COMPLETA');
}

