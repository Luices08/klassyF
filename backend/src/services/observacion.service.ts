import { HydratedDocument, Types } from 'mongoose';
import { ContextoObservacion, MAX_COMENTARIO_OBSERVACION } from '../constants/convivencia';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { ROLES } from '../constants/roles';
import AcademicYear from '../models/academicYear.model';
import Descriptor, { DescriptorDocument } from '../models/descriptor.model';
import Enrollment from '../models/enrollment.model';
import Group, { IGroup } from '../models/group.model';
import Observacion, { IDescriptorRegistrado, IObservacion, ObservacionDocument } from '../models/observacion.model';
import StudentProfile from '../models/studentProfile.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import TipoObservacion, { TipoObservacionDocument } from '../models/tipoObservacion.model';
import { User, UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import {
  componerTextoObservacion,
  dentroDelPlazo,
  esSituacionGrave,
  ModoVistaObservacion,
  tipoSituacionMaxima,
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
import { registrarEvento } from './audit.service';
import { cargarContextoFechas, fechaDeClase, hoyColombia, periodoDeFecha } from './attendance.service';
import { obtenerConfiguracion } from './convivenciaCatalogo.service';

const MAYORIA_DE_EDAD = 18;
const LIMITE_BUSQUEDA = 30;
const NO_ENCONTRADO = 'Estudiante no encontrado.';

// "No existe" y "no autorizado" responden igual, para no revelar qué estudiantes existen (IDOR).
const estudianteNoEncontrado = () => new ApiError(404, NO_ENCONTRADO);

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

// --- Registro ---

export interface RegistrarObservacionInput {
  estudiantes_ids: string[];
  tipo_id: string;
  descriptores_ids: string[];
  comentario?: string;
  fecha_hecho: string;
  /** Solo coordinación/ADMIN: el docente al que se atribuye cuando registran por él. */
  en_nombre_de_id?: string;
}

const ROLES_EN_NOMBRE_DE: string[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.COORDINADOR_CONVIVENCIA];

const comoDescriptorRegistrado = (d: DescriptorDocument): IDescriptorRegistrado => ({
  descriptor_id: d._id,
  codigo: d.codigo,
  texto: d.texto,
  tipo_situacion: d.tipo_situacion,
});

/** Reglas de contenido comunes a registrar y enmendar: frase o texto; una disciplinaria exige los hechos. */
function exigirContenido(familia: string, descriptores: unknown[], comentario: string) {
  if (descriptores.length === 0 && !comentario.trim()) {
    throw new ApiError(400, 'Elige al menos una frase o escribe un comentario.');
  }
  if (familia === 'DISCIPLINARIA' && !comentario.trim()) {
    throw new ApiError(400, 'Una observación disciplinaria exige describir los hechos.');
  }
  if (comentario.length > MAX_COMENTARIO_OBSERVACION) {
    throw new ApiError(400, `El comentario no puede superar ${MAX_COMENTARIO_OBSERVACION} caracteres.`);
  }
}

/** Las frases deben ser del tipo elegido y estar activas, salvo las que la observación ya traía. */
async function resolverDescriptores(
  tipoId: Types.ObjectId,
  ids: string[],
  yaRegistrados: IDescriptorRegistrado[] = []
): Promise<IDescriptorRegistrado[]> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return [];
  const previos = new Map(yaRegistrados.map((d) => [String(d.descriptor_id), d]));
  const nuevos = unicos.filter((id) => !previos.has(id));
  const encontrados = await Descriptor.find({ _id: { $in: nuevos }, tipo_id: tipoId, estado: ESTADO_ACTIVO });
  if (encontrados.length !== nuevos.length) {
    throw new ApiError(400, 'Alguna frase no existe, está inactiva o no pertenece al tipo de observación elegido.');
  }
  const nuevosPorId = new Map(encontrados.map((d) => [String(d._id), comoDescriptorRegistrado(d)]));
  return unicos.map((id) => previos.get(id) ?? (nuevosPorId.get(id) as IDescriptorRegistrado));
}

async function resolverTipo(
  tipoId: string,
  descriptoresIds: string[],
  comentario: string
): Promise<{ tipo: TipoObservacionDocument; descriptores: IDescriptorRegistrado[] }> {
  const tipo = await TipoObservacion.findById(tipoId);
  if (!tipo || tipo.estado === 'inactivo') throw new ApiError(400, 'El tipo de observación no existe o está inactivo.');
  const descriptores = await resolverDescriptores(tipo._id, descriptoresIds);
  exigirContenido(tipo.familia, descriptores, comentario);
  return { tipo, descriptores };
}

function contextoDeRegistro(usuario: UserDocument, datos: EstudianteConvivencia): ContextoObservacion {
  if (usuario.rol !== ROLES.DOCENTE) return 'COORDINACION';
  return datos.docenteDictaClase ? 'CLASE' : 'DIRECCION_GRUPO';
}

export async function registrarObservacion(input: RegistrarObservacionInput, usuario: UserDocument, ip?: string | null) {
  const comentario = (input.comentario ?? '').trim();
  const anio = await anioEnCurso();
  const fecha = fechaDeClase(input.fecha_hecho);
  if (fecha > hoyColombia()) throw new ApiError(400, 'La fecha del hecho no puede ser futura.');

  const { tipo, descriptores } = await resolverTipo(input.tipo_id, input.descriptores_ids, comentario);

  let autorId = usuario._id;
  if (input.en_nombre_de_id) {
    if (!ROLES_EN_NOMBRE_DE.includes(usuario.rol)) {
      throw new ApiError(403, 'Solo coordinación o administración pueden registrar en nombre de un docente.');
    }
    const docente = await User.findOne({ _id: input.en_nombre_de_id, rol: ROLES.DOCENTE, estado: ESTADO_ACTIVO });
    if (!docente) throw new ApiError(400, 'El docente indicado no existe o está inactivo.');
    autorId = docente._id;
  }

  const estudiantesIds = [...new Set(input.estudiantes_ids)];
  const eventoId = estudiantesIds.length > 1 ? new Types.ObjectId() : null;
  const contextosDeFecha = new Map<string, Awaited<ReturnType<typeof cargarContextoFechas>>>();
  const texto = componerTextoObservacion(descriptores, comentario);
  const situacionMaxima = tipoSituacionMaxima(descriptores);

  // Se valida a todos antes de escribir: o se registra el hecho para todos, o para ninguno.
  const documentos: Partial<IObservacion>[] = [];
  for (const studentId of estudiantesIds) {
    const contexto = await exigirPermiso(usuario, studentId, 'REGISTRAR_OBSERVACION');
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

    documentos.push({
      student_id: contexto.student_id,
      enrollment_id: contexto.enrollment_id,
      group_id: contexto.grupo._id,
      sede_id: contexto.grupo.sede_id,
      academic_year_id: anio._id,
      periodo_numero: periodo,
      fecha_hecho: fecha,
      tipo_id: tipo._id,
      tipo_nombre: tipo.nombre,
      familia: tipo.familia,
      visible_estudiante: tipo.visible_estudiante,
      descriptores,
      tipo_situacion_maxima: situacionMaxima,
      comentario,
      texto_generado: texto,
      evento_id: eventoId,
      registrado_por: usuario._id,
      autor_id: autorId,
      contexto: contextoDeRegistro(usuario, contexto.datos),
    });
  }

  const creadas = await runTransaction((session) => Observacion.insertMany(documentos, { session }));

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'OBSERVACION_REGISTRADA',
    entidad: 'Observacion',
    entidad_id: creadas[0]?._id,
    detalle: `${creadas.length} estudiante(s)${eventoId ? `; evento ${eventoId}` : ''}`,
    ip,
  });
  return creadas.map((o) => vistaObservacion(o, 'COMPLETA'));
}

// --- Consulta ---

const esAutor = (obs: ObservacionDocument, usuario: UserDocument) =>
  String(obs.autor_id) === String(usuario._id) || String(obs.registrado_por) === String(usuario._id);

const ROLES_VEN_ANULADAS: string[] = [ROLES.ADMIN, ROLES.COORDINADOR_CONVIVENCIA];

/** Filtro de lo que el rol puede leer del historial de un estudiante (el servidor decide, no la pantalla). */
function filtroPorRol(usuario: UserDocument): Record<string, unknown> {
  if (ROLES_VEN_ANULADAS.includes(usuario.rol)) return {};
  if (usuario.rol === ROLES.COORDINADOR) return { estado: 'ACTIVA', familia: { $ne: 'DISCIPLINARIA' } };
  return { estado: 'ACTIVA' };
}

/** El director de grupo ve que una situación II/III existe, no su contenido. */
function modoParaConsultante(usuario: UserDocument, obs: ObservacionDocument): ModoVistaObservacion {
  if (usuario.rol === ROLES.DOCENTE && !esAutor(obs, usuario) && esSituacionGrave(obs.tipo_situacion_maxima)) {
    return 'RESERVADA';
  }
  return 'COMPLETA';
}

async function conNombres(vistas: ReturnType<typeof vistaObservacion>[]) {
  const ids = new Set<string>();
  for (const v of vistas) if ('autor_id' in v) ids.add(v.autor_id);
  const usuarios = await User.find({ _id: { $in: [...ids] } }).select('nombre apellido');
  const nombre = new Map(usuarios.map((u) => [String(u._id), `${u.nombre} ${u.apellido}`]));
  return vistas.map((v) => ('autor_id' in v ? { ...v, autor: nombre.get(v.autor_id) ?? null } : v));
}

export interface Paginacion {
  pagina: number;
  limite: number;
}

async function paginar(filtro: Record<string, unknown>, { pagina, limite }: Paginacion) {
  const [total, datos] = await Promise.all([
    Observacion.countDocuments(filtro),
    Observacion.find(filtro)
      .sort({ fecha_hecho: -1, createdAt: -1 })
      .skip((pagina - 1) * limite)
      .limit(limite),
  ]);
  return { total, datos };
}

/** Historial de convivencia: vista derivada del Observador de un estudiante (todos los años). */
export async function historialDeEstudiante(
  studentId: string,
  usuario: UserDocument,
  paginacion: Paginacion,
  ip?: string | null
) {
  await exigirPermiso(usuario, studentId, 'CONSULTAR_HISTORIAL');
  const { total, datos } = await paginar({ student_id: studentId, ...filtroPorRol(usuario) }, paginacion);

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'CONVIVENCIA_HISTORIAL_CONSULTADO',
    entidad: 'User',
    entidad_id: studentId,
    detalle: `${datos.length} registro(s)`,
    ip,
  });
  const vistas = await conNombres(datos.map((o) => vistaObservacion(o, modoParaConsultante(usuario, o))));
  return { total, ...paginacion, data: vistas };
}

export async function obtenerObservacion(id: string, usuario: UserDocument, ip?: string | null) {
  const obs = Types.ObjectId.isValid(id) ? await Observacion.findById(id) : null;
  if (!obs) throw new ApiError(404, 'Observación no encontrada.');

  if (!esAutor(obs, usuario)) {
    await exigirPermiso(usuario, String(obs.student_id), 'CONSULTAR_HISTORIAL').catch(() => {
      throw new ApiError(404, 'Observación no encontrada.');
    });
    const visible = obs.estado === 'ACTIVA' || ROLES_VEN_ANULADAS.includes(usuario.rol);
    const familiaPermitida = usuario.rol !== ROLES.COORDINADOR || obs.familia !== 'DISCIPLINARIA';
    if (!visible || !familiaPermitida) throw new ApiError(404, 'Observación no encontrada.');
  }

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'CONVIVENCIA_HISTORIAL_CONSULTADO',
    entidad: 'Observacion',
    entidad_id: obs._id,
    ip,
  });
  const [vista] = await conNombres([vistaObservacion(obs, modoParaConsultante(usuario, obs))]);
  return vista;
}

/** Lo que el propio usuario registró (el docente no consulta el Observador: solo ve lo suyo). */
export async function misObservaciones(usuario: UserDocument, paginacion: Paginacion) {
  const { total, datos } = await paginar({ $or: [{ autor_id: usuario._id }, { registrado_por: usuario._id }] }, paginacion);
  const estudiantes = await User.find({ _id: { $in: datos.map((o) => o.student_id) } }).select('nombre apellido');
  const nombre = new Map(estudiantes.map((u) => [String(u._id), `${u.apellido} ${u.nombre}`]));
  const data = datos.map((o) => ({
    ...vistaObservacion(o, 'COMPLETA'),
    estudiante: nombre.get(String(o.student_id)) ?? '',
  }));
  return { total, ...paginacion, data };
}

async function esMayorDeEdad(studentId: Types.ObjectId): Promise<boolean> {
  const perfil = await StudentProfile.findOne({ user_id: studentId }).select('fecha_nacimiento');
  if (!perfil) return false;
  const limite = new Date(perfil.fecha_nacimiento);
  limite.setUTCFullYear(limite.getUTCFullYear() + MAYORIA_DE_EDAD);
  return limite <= new Date();
}

/**
 * El estudiante ve solo lo suyo y solo el texto final: los tipos marcados como visibles; un estudiante adulto (jornadas
 * nocturna/sabatina) ve todo lo suyo salvo lo que ya es una situación II/III, que se gestiona como caso.
 */
export async function miObservador(usuario: UserDocument, ip?: string | null) {
  if (usuario.rol !== ROLES.ESTUDIANTE) throw new ApiError(403, 'Solo un estudiante consulta su propio observador.');
  const adulto = await esMayorDeEdad(usuario._id);
  const filtro: Record<string, unknown> = { student_id: usuario._id, estado: 'ACTIVA' };
  if (adulto) filtro.tipo_situacion_maxima = { $nin: ['II', 'III'] };
  else filtro.visible_estudiante = true;

  const datos = await Observacion.find(filtro).sort({ fecha_hecho: -1, createdAt: -1 }).limit(200);
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'CONVIVENCIA_OBSERVACIONES_PROPIAS_CONSULTADAS',
    entidad: 'User',
    entidad_id: usuario._id,
    detalle: `${datos.length} registro(s)`,
    ip,
  });
  return datos.map((o) => vistaObservacion(o, 'ESTUDIANTE'));
}

// --- Enmienda y anulación ---

/**
 * Quién puede corregir una observación: el autor dentro del plazo configurable; coordinación (de sus sedes) y ADMIN
 * sin plazo. El coordinador académico solo las no disciplinarias. Nunca en un año cerrado.
 */
async function cargarModificable(id: string, usuario: UserDocument, plazoHoras: (c: { plazo_enmienda_horas: number; plazo_anulacion_horas: number }) => number) {
  const obs = Types.ObjectId.isValid(id) ? await Observacion.findById(id) : null;
  if (!obs) throw new ApiError(404, 'Observación no encontrada.');

  const conv = comoUsuarioConvivencia(usuario);
  const coordinacion =
    usuario.rol === ROLES.ADMIN ||
    (usuario.rol === ROLES.COORDINADOR_CONVIVENCIA && enAlcanceDeSede(conv, String(obs.sede_id))) ||
    (usuario.rol === ROLES.COORDINADOR && enAlcanceDeSede(conv, String(obs.sede_id)) && obs.familia !== 'DISCIPLINARIA');
  const autor = usuario.rol === ROLES.DOCENTE && esAutor(obs, usuario);
  if (!coordinacion && !autor) throw new ApiError(404, 'Observación no encontrada.');

  if (obs.estado === 'ANULADA') throw new ApiError(409, 'La observación está anulada y no se puede modificar.');
  const anio = await AcademicYear.findById(obs.academic_year_id);
  if (anio?.estado === 'CERRADO') throw new ApiError(409, 'El año lectivo está cerrado: la observación es solo de lectura.');

  if (!coordinacion) {
    const configuracion = await obtenerConfiguracion();
    if (!dentroDelPlazo(obs.createdAt, plazoHoras(configuracion))) {
      throw new ApiError(403, 'Venció el plazo para modificar tu observación; solicítalo a coordinación.');
    }
  }
  return obs;
}

export interface EnmendarObservacionInput {
  descriptores_ids?: string[];
  comentario?: string;
}

export async function enmendarObservacion(
  id: string,
  input: EnmendarObservacionInput,
  usuario: UserDocument,
  ip?: string | null
) {
  const obs = await cargarModificable(id, usuario, (c) => c.plazo_enmienda_horas);

  const comentario = input.comentario !== undefined ? input.comentario.trim() : obs.comentario;
  const descriptores = input.descriptores_ids
    ? await resolverDescriptores(obs.tipo_id, input.descriptores_ids, obs.descriptores)
    : obs.descriptores;
  exigirContenido(obs.familia, descriptores, comentario);

  obs.enmiendas.push({
    fecha: new Date(),
    por: usuario._id,
    descriptores_anteriores: obs.descriptores,
    comentario_anterior: obs.comentario,
    texto_anterior: obs.texto_generado,
  });
  obs.descriptores = descriptores;
  obs.comentario = comentario;
  obs.texto_generado = componerTextoObservacion(descriptores, comentario);
  obs.tipo_situacion_maxima = tipoSituacionMaxima(descriptores);
  await obs.save();

  await registrarEvento({ usuario_id: usuario._id, accion: 'OBSERVACION_ENMENDADA', entidad: 'Observacion', entidad_id: obs._id, ip });
  return vistaObservacion(obs, 'COMPLETA');
}

export async function anularObservacion(id: string, motivo: string, usuario: UserDocument, ip?: string | null) {
  const obs = await cargarModificable(id, usuario, (c) => c.plazo_anulacion_horas);
  obs.estado = 'ANULADA';
  obs.anulacion = { motivo: motivo.trim(), por: usuario._id, fecha: new Date() };
  await obs.save();

  // El motivo es texto libre: queda en la observación, no en la auditoría.
  await registrarEvento({ usuario_id: usuario._id, accion: 'OBSERVACION_ANULADA', entidad: 'Observacion', entidad_id: obs._id, ip });
  return vistaObservacion(obs, 'COMPLETA');
}
