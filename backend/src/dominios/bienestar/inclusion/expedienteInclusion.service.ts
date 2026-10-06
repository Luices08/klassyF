import fs from 'fs/promises';
import path from 'path';
import { ClientSession, Types } from 'mongoose';
import {
  EstadoExpediente,
  MAX_BYTES_SOPORTE,
  MAX_SOPORTES_POR_EXPEDIENTE,
  TipoExpediente,
} from './inclusion.constants';
import { ESTADOS_MATRICULA_ACTIVOS } from '../../../constants/enums';
import { ROLES } from '../../../constants/roles';
import AcademicYear from '../../institucional/calendario/academicYear.model';
import AjusteAsignatura from './ajusteAsignatura.model';
import Campus from '../../institucional/estructura/campus.model';
import Enrollment from '../../../models/enrollment.model';
import ExpedienteInclusion, { ExpedienteInclusionDocument } from './expedienteInclusion.model';
import Grade from '../../institucional/estructura/grade.model';
import Group from '../../institucional/estructura/group.model';
import JornadaOperativa from '../../institucional/estructura/jornadaOperativa.model';
import StudentProfile from '../../../models/studentProfile.model';
import Subject from '../../../models/subject.model';
import TeacherAssignment from '../../../models/teacherAssignment.model';
import { User, UserDocument } from '../../../models/user.model';
import ApiError from '../../../utils/ApiError';
import { detectarFirmaArchivo } from '../../../utils/firmasArchivo';
import { ESTADO_ACTIVO } from '../../../utils/filtroEstado';
import {
  ajusteCompleto,
  Completitud,
  completitudDeAjustes,
  fechaLimiteElaboracion,
  fusionarSeccion,
  edadEnAnios,
  huellaDeArchivo,
  pendientesParaAprobar,
  plazoVencido,
  puedeTransicionar,
} from './inclusion';
import { AccionInclusion, alcanceDeInclusion, permisoInclusion, ROLES_BANDEJA_INCLUSION } from './permisosInclusion';
import { carpetaInclusion } from '../../../utils/uploadPaths';
import { registrarEvento } from '../../../services/audit.service';
import {
  anioEnCurso,
  asignaturasEsperadas,
  cargarContextoEstudiante,
  comoUsuarioInclusion,
  ContextoEstudianteInclusion,
  exigirAnioNoCerrado,
  exigirPermiso,
  noEncontrado,
  obtenerConfiguracion,
} from './inclusionContexto.service';
import { buscarAnioEnCurso } from '../../institucional';

export interface AbrirExpedienteInput {
  student_id: string;
  tipo: TipoExpediente;
  solicitud_id?: string | null;
  /** Copia características, ajustes de contexto y transversales del año anterior como borrador (la autorización NO se hereda). */
  copiar_anterior?: boolean;
}

/**
 * Abre el expediente de inclusión de un estudiante con matrícula activa en el año en curso (RN-16-02). Uno por estudiante y año.
 * Se puede llamar dentro de una transacción (la resolución de una solicitud lo hace).
 */
export async function abrirExpediente(input: AbrirExpedienteInput, usuario: UserDocument, ip?: string | null, session?: ClientSession): Promise<ExpedienteInclusionDocument> {
  const anio = await anioEnCurso();
  const ctx = exigirPermiso(usuario, await cargarContextoEstudiante(usuario, input.student_id, anio._id), 'GESTIONAR_EXPEDIENTE');
  if (!ctx.vigente) throw new ApiError(409, 'El estudiante no tiene una matrícula activa en el año en curso.');

  const configuracion = await obtenerConfiguracion();
  const anterior = input.copiar_anterior
    ? await ExpedienteInclusion.findOne({ student_id: input.student_id, academic_year_id: { $ne: anio._id }, tipo: input.tipo }).sort({ createdAt: -1 })
    : null;

  let creado: ExpedienteInclusionDocument;
  try {
    const datos = {
      student_id: input.student_id,
      academic_year_id: anio._id,
      sede_id: ctx.grupo.sede_id,
      tipo: input.tipo,
      estado: 'BORRADOR' as EstadoExpediente,
      solicitud_id: input.solicitud_id ?? null,
      fecha_limite_elaboracion: fechaLimiteElaboracion(anio.fecha_inicio, ctx.matricula.fecha_matricula, configuracion.plazo_elaboracion_dias),
      creado_por: usuario._id,
      ...(anterior
        ? {
            categoria_discapacidad: anterior.categoria_discapacidad,
            anexo_info_general: anterior.toObject().anexo_info_general,
            caracteristicas: anterior.toObject().caracteristicas,
            transversales: anterior.toObject().transversales,
            pmi: anterior.toObject().pmi,
            plan_apoyo: anterior.toObject().plan_apoyo,
          }
        : {}),
    };
    const [nuevo] = await ExpedienteInclusion.create([datos], { session });
    if (!nuevo) throw new ApiError(500, 'No se pudo crear el expediente.');
    creado = nuevo;
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new ApiError(409, 'El estudiante ya tiene un expediente de inclusión en este año lectivo.');
    throw err;
  }
  await registrarEvento({ usuario_id: usuario._id, accion: 'INCLUSION_EXPEDIENTE_CREADO', entidad: 'ExpedienteInclusion', entidad_id: creado._id, detalle: input.tipo, ip });
  return creado;
}

async function cargarExpediente(id: string): Promise<ExpedienteInclusionDocument> {
  const exp = Types.ObjectId.isValid(id) ? await ExpedienteInclusion.findById(id) : null;
  if (!exp) throw noEncontrado('Expediente');
  return exp;
}

export interface ExpedienteCargado {
  exp: ExpedienteInclusionDocument;
  ctx: ContextoEstudianteInclusion;
}

/** Carga el expediente y decide el acceso con el grupo VIGENTE del estudiante (no el de apertura): "no existe" = "no autorizado". */
export async function cargarConPermiso(
  id: string,
  usuario: UserDocument,
  accion: Parameters<typeof exigirPermiso>[2],
  extra: Parameters<typeof exigirPermiso>[3] = {}
): Promise<ExpedienteCargado> {
  const exp = await cargarExpediente(id);
  const ctx = exigirPermiso(usuario, await cargarContextoEstudiante(usuario, exp.student_id, exp.academic_year_id), accion, extra);
  return { exp, ctx };
}

export async function exigirEditable(exp: ExpedienteInclusionDocument): Promise<void> {
  if (exp.estado === 'CERRADO') throw new ApiError(409, 'El expediente está cerrado: es histórico y solo se consulta.');
  await exigirAnioNoCerrado(exp.academic_year_id);
}

/**
 * Guarda un cambio de contenido: con el expediente ACTIVO o aprobado sube la versión (el PIAR es progresivo; lo ya firmado no
 * cambia) y con el aprobado lo devuelve a construcción (una aprobación no cubre un contenido que cambió después).
 */
export async function guardarCambio(exp: ExpedienteInclusionDocument, usuario: UserDocument, detalle: string, ip?: string | null): Promise<void> {
  // Cada cambio con el expediente ya aprobado o firmado sube la versión: un documento emitido antes queda desactualizado y no se puede firmar.
  if (exp.estado === 'ACTIVO' || exp.estado === 'LISTO_PARA_ACUERDO') exp.version += 1;
  if (exp.estado === 'LISTO_PARA_ACUERDO') {
    exp.estado = 'EN_CONSTRUCCION';
    exp.aprobado = null;
  }
  await exp.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'INCLUSION_EXPEDIENTE_ACTUALIZADO', entidad: 'ExpedienteInclusion', entidad_id: exp._id, detalle, ip });
}

// --- Datos del estudiante, completitud y vistas ---

export async function identidadDelEstudiante(exp: ExpedienteInclusionDocument, ctx: ContextoEstudianteInclusion) {
  const [usuario, perfil, grado, sede, jornada] = await Promise.all([
    User.findById(exp.student_id).select('nombre apellido tipo_documento numero_documento'),
    StudentProfile.findOne({ user_id: exp.student_id }),
    Grade.findById(ctx.grupo.grade_id).select('nombre'),
    Campus.findById(ctx.grupo.sede_id).select('nombre'),
    JornadaOperativa.findById(ctx.grupo.jornada_id).select('nombre'),
  ]);
  return {
    student_id: String(exp.student_id),
    nombre: usuario?.nombre ?? '',
    apellido: usuario?.apellido ?? '',
    tipo_documento: usuario?.tipo_documento ?? '',
    numero_documento: usuario?.numero_documento ?? '',
    fecha_nacimiento: perfil?.fecha_nacimiento ?? null,
    edad: perfil?.fecha_nacimiento ? edadEnAnios(perfil.fecha_nacimiento, new Date()) : null,
    grado: grado?.nombre ?? '',
    grupo: ctx.grupo.nomenclatura,
    group_id: String(ctx.grupo._id),
    sede: sede?.nombre ?? '',
    jornada: jornada?.nombre ?? '',
    perfil,
  };
}

export async function completitudDelExpediente(exp: ExpedienteInclusionDocument, ctx: ContextoEstudianteInclusion): Promise<Completitud> {
  const [esperadas, ajustes] = await Promise.all([asignaturasEsperadas(ctx.grupo), AjusteAsignatura.find({ expediente_id: exp._id })]);
  return completitudDeAjustes(
    esperadas.map((e) => ({ subject_id: e.subject_id, docente_id: e.docente_id })),
    ajustes.map((a) => ({
      subject_id: String(a.subject_id),
      dba_ids: a.dba_ids.map(String),
      objetivo_flexibilizado: a.objetivo_flexibilizado,
      barrera_asignatura: a.barrera_asignatura,
      ajuste_metodologico: a.ajuste_metodologico,
      ajuste_evaluativo: a.ajuste_evaluativo,
    }))
  );
}

const lleno = (t: string | undefined) => Boolean(t && t.trim().length > 0);

export async function pendientesDelExpediente(exp: ExpedienteInclusionDocument, ctx: ContextoEstudianteInclusion) {
  const completitud = await completitudDelExpediente(exp, ctx);
  const c = exp.caracteristicas;
  const pendientes = pendientesParaAprobar({
    tipo: exp.tipo,
    consentimiento_otorgado: exp.consentimiento.otorgado,
    caracteristicas_completas: lleno(c.gustos_intereses) && lleno(c.lo_que_hace_puede_requiere_apoyo),
    plan_apoyo_completo: Boolean(exp.plan_apoyo.tipo_necesidad) && lleno(exp.plan_apoyo.observacion_inicial) && exp.plan_apoyo.pautas_aula.length > 0,
    completitud,
  });
  return { completitud, pendientes };
}

/** Lo único que ve un docente de la condición del estudiante: pautas pedagógicas y, si orientación lo escribió, una alerta de seguridad. */
export function fichaPedagogica(exp: ExpedienteInclusionDocument) {
  const c = exp.caracteristicas;
  return {
    gustos_intereses: c.gustos_intereses,
    lo_que_hace_puede_requiere_apoyo: c.lo_que_hace_puede_requiere_apoyo,
    habilidades_competencias: c.habilidades_competencias,
    barreras_generales: c.barreras_generales,
    recomendaciones_aula: c.recomendaciones_aula,
    pautas_evaluacion: c.pautas_evaluacion,
    alerta_seguridad_aula: c.alerta_seguridad_aula,
    pautas_aula_plan: exp.plan_apoyo.pautas_aula,
    pautas_evaluacion_plan: exp.plan_apoyo.pautas_evaluacion,
  };
}

const sinPerfil = <T extends { perfil?: unknown }>({ perfil: _perfil, ...resto }: T) => resto;

export async function obtenerExpediente(id: string, usuario: UserDocument, ip?: string | null) {
  const exp = await cargarExpediente(id);
  const ctx = exigirPermiso(usuario, await cargarContextoEstudiante(usuario, exp.student_id, exp.academic_year_id), 'VER_FICHA_PEDAGOGICA');
  const clinico = exigirPermisoSiLoTiene(usuario, ctx, 'VER_CLINICO');
  const gestiona = exigirPermisoSiLoTiene(usuario, ctx, 'GESTIONAR_EXPEDIENTE');
  const verTodos = exigirPermisoSiLoTiene(usuario, ctx, 'VER_TODOS_LOS_AJUSTES');
  const identidad = await identidadDelEstudiante(exp, ctx);
  const configuracion = await obtenerConfiguracion();

  await registrarEvento({ usuario_id: usuario._id, accion: 'INCLUSION_EXPEDIENTE_CONSULTADO', entidad: 'ExpedienteInclusion', entidad_id: exp._id, ip });

  const anio = await AcademicYear.findById(exp.academic_year_id).select('estado year');
  const editable = exp.estado !== 'CERRADO' && anio?.estado !== 'CERRADO';
  const base = {
    _id: String(exp._id),
    estado: exp.estado,
    version: exp.version,
    academic_year_id: String(exp.academic_year_id),
    anio: anio?.year ?? null,
    editable,
    fecha_limite_elaboracion: exp.fecha_limite_elaboracion,
    plazo_vencido: plazoVencido(exp.fecha_limite_elaboracion, exp.estado, new Date()),
    seguimientos_minimos: configuracion.seguimientos_minimos_anio,
    // Neutral para todos: la pantalla decide si muestra la pestaña de ajustes sin revelar la modalidad (la condición del estudiante).
    usa_ajustes: exp.tipo === 'PIAR',
    estudiante: sinPerfil(identidad),
    ficha_pedagogica: fichaPedagogica(exp),
    permisos: { gestiona, clinico, ver_todos_los_ajustes: verTodos },
  };

  // Docente de clase: solo la ficha pedagógica (sin modalidad ni categoría) y sus propios ajustes por la ruta de ajustes.
  if (!gestiona && !verTodos) return { ...base, modalidad_visible: false };

  const { completitud, pendientes } = await pendientesDelExpediente(exp, ctx);
  const comun = {
    ...base,
    modalidad_visible: usuario.rol !== ROLES.DOCENTE,
    // El director de grupo ve todos los ajustes de su grupo, pero no la modalidad: rótulos como «PIAR» revelan la condición.
    ...(usuario.rol === ROLES.DOCENTE ? {} : { tipo: exp.tipo }),
    aprobado: exp.aprobado,
    cierre: exp.cierre,
    transversales: exp.transversales,
    pmi: exp.pmi,
    compromisos_familia: exp.compromisos_familia,
    compromisos_aula: exp.compromisos_aula,
    informe_anual: exp.informe_anual,
    completitud,
    pendientes_aprobacion: pendientes,
    consentimiento_otorgado: exp.consentimiento.otorgado,
  };
  if (!clinico) return comun;

  // Orientación/ADMIN: lo clínico. EPS y régimen se LEEN de M03 aquí (no se duplican) y solo dentro de un expediente abierto.
  return {
    ...comun,
    categoria_discapacidad: exp.categoria_discapacidad,
    consentimiento: exp.consentimiento,
    anexo_info_general: exp.anexo_info_general,
    caracteristicas: exp.caracteristicas,
    plan_apoyo: exp.plan_apoyo,
    soportes: exp.soportes.map((s) => ({ _id: String(s._id), nombre: s.nombre, descripcion: s.descripcion, fecha: s.fecha })),
    salud_administrativa: { eps: identidad.perfil?.eps ?? null, regimen_salud: identidad.perfil?.regimen_salud ?? null },
    solicitud_id: exp.solicitud_id ? String(exp.solicitud_id) : null,
  };
}

function exigirPermisoSiLoTiene(usuario: UserDocument, ctx: ContextoEstudianteInclusion, accion: AccionInclusion): boolean {
  return permisoInclusion(comoUsuarioInclusion(usuario), ctx.contexto, accion);
}

// --- Listados ---

export interface FiltroExpedientes {
  estado?: EstadoExpediente;
  tipo?: TipoExpediente;
  group_id?: string;
  q?: string;
}

export async function listarExpedientes(usuario: UserDocument, filtro: FiltroExpedientes, { pagina, limite }: { pagina: number; limite: number }, ip?: string | null) {
  if (!ROLES_BANDEJA_INCLUSION.includes(usuario.rol)) throw new ApiError(403, 'No tienes acceso a los expedientes de inclusión.');
  const alcance = alcanceDeInclusion(comoUsuarioInclusion(usuario));
  const consulta: Record<string, unknown> = {};
  if (alcance !== 'TODAS') consulta.sede_id = { $in: alcance };
  if (filtro.estado) consulta.estado = filtro.estado;
  if (filtro.tipo) consulta.tipo = filtro.tipo;

  if (filtro.group_id || filtro.q) {
    const estudiantes = await estudiantesDeFiltro(filtro);
    consulta.student_id = { $in: estudiantes };
  }

  const [total, datos] = await Promise.all([
    ExpedienteInclusion.countDocuments(consulta),
    ExpedienteInclusion.find(consulta)
      .sort({ updatedAt: -1 })
      .skip((pagina - 1) * limite)
      .limit(limite),
  ]);

  const esCoordinador = usuario.rol === ROLES.COORDINADOR;
  const filas = await Promise.all(
    datos.map(async (exp) => {
      const ctx = await cargarContextoEstudiante(usuario, exp.student_id, exp.academic_year_id);
      if (!ctx) return null;
      const identidad = await identidadDelEstudiante(exp, ctx);
      const { completitud } = await pendientesDelExpediente(exp, ctx);
      return {
        _id: String(exp._id),
        estado: exp.estado,
        // El coordinador supervisa avance; no necesita la modalidad (revela la condición del estudiante).
        ...(esCoordinador ? {} : { tipo: exp.tipo }),
        estudiante: { student_id: String(exp.student_id), nombre: identidad.nombre, apellido: identidad.apellido, numero_documento: identidad.numero_documento },
        grado: identidad.grado,
        grupo: identidad.grupo,
        porcentaje_ajustes: completitud.porcentaje,
        sin_docente: completitud.sin_docente.length,
        plazo_vencido: plazoVencido(exp.fecha_limite_elaboracion, exp.estado, new Date()),
        fecha_limite_elaboracion: exp.fecha_limite_elaboracion,
        updatedAt: exp.updatedAt,
      };
    })
  );
  await registrarEvento({ usuario_id: usuario._id, accion: 'INCLUSION_BANDEJA_CONSULTADA', entidad: 'ExpedienteInclusion', detalle: `${filas.length} expediente(s)`, ip });
  return { total, pagina, limite, data: filas.filter(Boolean) };
}

async function estudiantesDeFiltro(filtro: FiltroExpedientes): Promise<Types.ObjectId[]> {
  const consulta: Record<string, unknown> = {};
  if (filtro.group_id && Types.ObjectId.isValid(filtro.group_id)) consulta.group_id = filtro.group_id;
  if (filtro.q && filtro.q.trim().length >= 2) {
    const patron = new RegExp(filtro.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const coincidentes = await User.find({ rol: ROLES.ESTUDIANTE, $or: [{ nombre: patron }, { apellido: patron }, { numero_documento: patron }] })
      .select('_id')
      .limit(200);
    consulta.student_id = { $in: coincidentes.map((u) => u._id) };
  }
  const matriculas = await Enrollment.find(consulta).select('student_id');
  return matriculas.map((m) => m.student_id);
}

/** Estudiantes con ajustes que le tocan a un docente (de clase o director), con las asignaturas suyas pendientes. */
export async function misEstudiantesConApoyo(usuario: UserDocument) {
  if (usuario.rol !== ROLES.DOCENTE) throw new ApiError(403, 'Solo el docente consulta sus estudiantes con ajustes.');
  const anio = await buscarAnioEnCurso();
  if (!anio) return [];

  const [clases, direccion] = await Promise.all([
    TeacherAssignment.find({ docente_id: usuario._id, academic_year_id: anio._id, tipo_asignacion: 'CLASE', estado: ESTADO_ACTIVO }),
    Group.find({ academic_year_id: anio._id, director_grupo_id: usuario._id }).select('_id'),
  ]);
  const gruposIds = [...new Set([...clases.map((c) => String(c.group_id)), ...direccion.map((g) => String(g._id))])];
  if (gruposIds.length === 0) return [];

  const matriculas = await Enrollment.find({ group_id: { $in: gruposIds }, academic_year_id: anio._id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } });
  const estudiantesIds = matriculas.map((m) => m.student_id);
  const expedientes = await ExpedienteInclusion.find({
    student_id: { $in: estudiantesIds },
    academic_year_id: anio._id,
    estado: { $in: ['EN_CONSTRUCCION', 'LISTO_PARA_ACUERDO', 'ACTIVO'] },
  });
  if (expedientes.length === 0) return [];

  const matriculaDe = new Map(matriculas.map((m) => [String(m.student_id), m]));
  const ajustes = await AjusteAsignatura.find({ expediente_id: { $in: expedientes.map((e) => e._id) } });
  const personas = await User.find({ _id: { $in: expedientes.map((e) => e.student_id) } }).select('nombre apellido');
  const persona = new Map(personas.map((p) => [String(p._id), p]));
  const grupos = await Group.find({ _id: { $in: gruposIds } }).select('nomenclatura');
  const grupo = new Map(grupos.map((g) => [String(g._id), g.nomenclatura]));

  const asignaturas = await Subject.find({ _id: { $in: clases.map((c) => c.subject_id) } }).select('nombre');
  const nombreAsignatura = new Map(asignaturas.map((s) => [String(s._id), s.nombre]));

  return expedientes.map((exp) => {
    const matricula = matriculaDe.get(String(exp.student_id));
    const groupId = matricula ? String(matricula.group_id) : '';
    const mias = clases.filter((c) => String(c.group_id) === groupId && c.subject_id);
    const persona_ = persona.get(String(exp.student_id));
    return {
      expediente_id: String(exp._id),
      estado: exp.estado,
      estudiante: { student_id: String(exp.student_id), nombre: persona_?.nombre ?? '', apellido: persona_?.apellido ?? '' },
      grupo: grupo.get(groupId) ?? '',
      es_director: direccion.some((g) => String(g._id) === groupId),
      mis_asignaturas: mias.map((c) => {
        const ajuste = ajustes.find((a) => String(a.expediente_id) === String(exp._id) && String(a.subject_id) === String(c.subject_id));
        return {
          subject_id: String(c.subject_id),
          nombre: nombreAsignatura.get(String(c.subject_id)) ?? '',
          completo: Boolean(
            ajuste &&
              ajusteCompleto({
                dba_ids: ajuste.dba_ids.map(String),
                objetivo_flexibilizado: ajuste.objetivo_flexibilizado,
                barrera_asignatura: ajuste.barrera_asignatura,
                ajuste_metodologico: ajuste.ajuste_metodologico,
                ajuste_evaluativo: ajuste.ajuste_evaluativo,
              })
          ),
        };
      }),
    };
  });
}

// --- Secciones del expediente ---

type Seccion = 'anexo_info_general' | 'caracteristicas' | 'transversales' | 'pmi' | 'compromisos_familia' | 'compromisos_aula' | 'plan_apoyo' | 'informe_anual' | 'categoria_discapacidad';

const SECCIONES_CLINICAS: Seccion[] = ['anexo_info_general', 'categoria_discapacidad', 'plan_apoyo'];

export async function actualizarSeccion(id: string, seccion: Seccion, valor: unknown, usuario: UserDocument, ip?: string | null): Promise<void> {
  const accion: AccionInclusion = seccion === 'transversales' || seccion === 'informe_anual' ? 'EDITAR_TRANSVERSALES' : 'GESTIONAR_EXPEDIENTE';
  const { exp } = await cargarConPermiso(id, usuario, accion);
  await exigirEditable(exp);
  if (exp.estado === 'BORRADOR' && seccion === 'informe_anual') throw new ApiError(409, 'El informe anual se redacta con el expediente en curso.');
  // Lo clínico se trata solo con autorización vigente del responsable legal (Ley 1581): sin ella no se guarda.
  if (SECCIONES_CLINICAS.includes(seccion) && !exp.consentimiento.otorgado) {
    throw new ApiError(409, 'Registra primero la autorización del responsable legal para tratar datos sensibles.');
  }
  if (seccion === 'plan_apoyo' && exp.tipo !== 'PLAN_APOYO') throw new ApiError(409, 'Esta sección es solo del plan de apoyo pedagógico.');
  if (seccion === 'transversales' && exp.tipo !== 'PIAR') throw new ApiError(409, 'Las dimensiones transversales son del PIAR.');

  const plano = exp.toObject() as unknown as Record<Seccion, unknown>;
  if (seccion === 'anexo_info_general' || seccion === 'caracteristicas' || seccion === 'plan_apoyo' || seccion === 'informe_anual') {
    exp.set(seccion, fusionarSeccion(plano[seccion] as Record<string, unknown>, valor as Record<string, unknown>));
  } else {
    exp.set(seccion, valor);
  }
  await guardarCambio(exp, usuario, `Sección ${seccion}`, ip);
}

// --- Consentimiento (Ley 1581 / 1098): propio de M16, distinto de la autorización de salud de M03 ---

export async function registrarConsentimiento(id: string, datos: { otorgado_por_nombre: string; parentesco: string }, usuario: UserDocument, ip?: string | null) {
  const { exp } = await cargarConPermiso(id, usuario, 'GESTIONAR_EXPEDIENTE');
  await exigirEditable(exp);
  const configuracion = await obtenerConfiguracion();
  exp.set('consentimiento', {
    otorgado: true,
    otorgado_por_nombre: datos.otorgado_por_nombre.trim(),
    parentesco: datos.parentesco.trim(),
    fecha: new Date(),
    version_politica: configuracion.version_politica_datos,
    registrado_por_id: usuario._id,
    revocado: null,
  });
  await exp.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'INCLUSION_CONSENTIMIENTO_REGISTRADO', entidad: 'ExpedienteInclusion', entidad_id: exp._id, ip });
  return { otorgado: true };
}

export async function revocarConsentimiento(id: string, motivo: string, usuario: UserDocument, ip?: string | null) {
  const { exp } = await cargarConPermiso(id, usuario, 'GESTIONAR_EXPEDIENTE');
  await exigirEditable(exp);
  if (!exp.consentimiento.otorgado) throw new ApiError(409, 'No hay una autorización vigente que revocar.');
  exp.set('consentimiento.otorgado', false);
  exp.set('consentimiento.revocado', { fecha: new Date(), por: usuario._id, motivo: motivo.trim() });
  await exp.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'INCLUSION_CONSENTIMIENTO_REGISTRADO', entidad: 'ExpedienteInclusion', entidad_id: exp._id, detalle: 'revocado', ip });
  return { otorgado: false };
}

// --- Soportes clínicos (nunca en Mongo ni por URL: archivo interno + descarga con sesión y permiso) ---

export async function cargarSoporte(
  id: string,
  archivo: Express.Multer.File | undefined,
  descripcion: string,
  usuario: UserDocument,
  ip?: string | null
) {
  const { exp } = await cargarConPermiso(id, usuario, 'VER_CLINICO');
  await exigirEditable(exp);
  if (!exp.consentimiento.otorgado) throw new ApiError(409, 'Registra primero la autorización del responsable legal para tratar datos sensibles.');
  if (!archivo) throw new ApiError(400, 'Adjunta el archivo del soporte.');
  if (archivo.size > MAX_BYTES_SOPORTE) throw new ApiError(400, 'El soporte supera el tamaño máximo permitido (5 MB).');
  if (exp.soportes.length >= MAX_SOPORTES_POR_EXPEDIENTE) throw new ApiError(409, 'El expediente alcanzó el máximo de soportes.');
  const firma = detectarFirmaArchivo(archivo.mimetype, archivo.buffer);
  if (!firma) throw new ApiError(400, 'El soporte no es un PDF, JPG, PNG o WEBP válido.');

  const carpeta = carpetaInclusion(String(exp._id));
  await fs.mkdir(carpeta, { recursive: true });
  const destino = path.join(carpeta, `soporte-${Date.now()}${firma.ext}`);
  await fs.writeFile(destino, archivo.buffer);

  exp.soportes.push({
    nombre: archivo.originalname.slice(0, 120),
    descripcion: descripcion.trim().slice(0, 500),
    archivo_path: path.relative(process.cwd(), destino),
    hash: huellaDeArchivo(archivo.buffer),
    cargado_por: usuario._id,
    fecha: new Date(),
  } as never);
  try {
    await exp.save();
  } catch (err) {
    await fs.rm(destino, { force: true });
    throw err;
  }
  await registrarEvento({ usuario_id: usuario._id, accion: 'INCLUSION_SOPORTE_CARGADO', entidad: 'ExpedienteInclusion', entidad_id: exp._id, ip });
  return { soporte_id: String(exp.soportes[exp.soportes.length - 1]?._id) };
}

export async function rutaDelSoporte(id: string, soporteId: string, usuario: UserDocument, ip?: string | null) {
  const { exp } = await cargarConPermiso(id, usuario, 'VER_CLINICO');
  const soporte = exp.soportes.find((s) => String(s._id) === soporteId);
  if (!soporte) throw new ApiError(404, 'Soporte no encontrado.');
  await registrarEvento({ usuario_id: usuario._id, accion: 'INCLUSION_SOPORTE_DESCARGADO', entidad: 'ExpedienteInclusion', entidad_id: exp._id, ip });
  return { ruta: path.resolve(process.cwd(), soporte.archivo_path), nombre: soporte.nombre };
}

// --- Estado ---

async function cambiarEstado(exp: ExpedienteInclusionDocument, hacia: EstadoExpediente, usuario: UserDocument, detalle: string, ip?: string | null) {
  if (!puedeTransicionar(exp.estado, hacia)) throw new ApiError(409, `No se puede pasar el expediente de ${exp.estado} a ${hacia}.`);
  const desde = exp.estado;
  exp.estado = hacia;
  await exp.save();
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'INCLUSION_EXPEDIENTE_ESTADO_CAMBIADO',
    entidad: 'ExpedienteInclusion',
    entidad_id: exp._id,
    detalle: `${desde} → ${hacia}. ${detalle}`.trim(),
    ip,
  });
}

/** Orientación inicia la construcción: desde aquí los docentes pueden diligenciar sus ajustes. Exige la autorización de datos. */
export async function iniciarConstruccion(id: string, usuario: UserDocument, ip?: string | null) {
  const { exp } = await cargarConPermiso(id, usuario, 'GESTIONAR_EXPEDIENTE');
  await exigirEditable(exp);
  if (!exp.consentimiento.otorgado) throw new ApiError(409, 'Registra primero la autorización del responsable legal.');
  await cambiarEstado(exp, 'EN_CONSTRUCCION', usuario, '', ip);
  return { estado: exp.estado };
}

/** Coordinación o ADMIN aprueba: todo lo que exige el formato debe estar completo. */
export async function aprobarExpediente(id: string, usuario: UserDocument, ip?: string | null) {
  const { exp, ctx } = await cargarConPermiso(id, usuario, 'APROBAR');
  await exigirEditable(exp);
  const { pendientes } = await pendientesDelExpediente(exp, ctx);
  if (pendientes.length > 0) throw new ApiError(409, `No se puede aprobar: ${pendientes.join(' ')}`);
  await cambiarEstado(exp, 'LISTO_PARA_ACUERDO', usuario, '', ip);
  exp.aprobado = { por: usuario._id, fecha: new Date() };
  await exp.save();
  return { estado: exp.estado };
}

export async function devolverExpediente(id: string, usuario: UserDocument, ip?: string | null) {
  const { exp } = await cargarConPermiso(id, usuario, 'APROBAR');
  await exigirEditable(exp);
  await cambiarEstado(exp, 'EN_CONSTRUCCION', usuario, 'devuelto a construcción', ip);
  exp.aprobado = null;
  await exp.save();
  return { estado: exp.estado };
}

/** Cierre manual (retiro, superado, año): el expediente queda como historia escolar, nunca se borra. */
export async function cerrarExpediente(id: string, motivo: string, usuario: UserDocument, ip?: string | null) {
  const { exp } = await cargarConPermiso(id, usuario, 'GESTIONAR_EXPEDIENTE');
  await cambiarEstado(exp, 'CERRADO', usuario, motivo, ip);
  exp.cierre = { por: usuario._id, fecha: new Date(), motivo: motivo.trim() };
  await exp.save();
  return { estado: exp.estado };
}

/** Lo usa la firma del acta: el expediente pasa a ACTIVO sin otro paso manual. */
export async function activarPorFirma(exp: ExpedienteInclusionDocument, usuario: UserDocument, ip?: string | null) {
  if (exp.estado === 'ACTIVO') return;
  await cambiarEstado(exp, 'ACTIVO', usuario, 'acta firmada', ip);
}

// --- Indicador para M12/M17/M19 (solo lectura): ellos deciden qué hacer con él ---

export async function indicadorDeGrupo(groupId: string, usuario: UserDocument) {
  if (!Types.ObjectId.isValid(groupId)) throw noEncontrado('Grupo');
  const grupo = await Group.findById(groupId);
  if (!grupo) throw noEncontrado('Grupo');
  const permitido =
    usuario.rol === ROLES.ADMIN ||
    ((usuario.rol === ROLES.ORIENTADOR || usuario.rol === ROLES.COORDINADOR) && usuario.sedes_ids.map(String).includes(String(grupo.sede_id))) ||
    (usuario.rol === ROLES.DOCENTE &&
      (String(grupo.director_grupo_id) === String(usuario._id) ||
        Boolean(await TeacherAssignment.exists({ docente_id: usuario._id, group_id: grupo._id, academic_year_id: grupo.academic_year_id, tipo_asignacion: 'CLASE', estado: ESTADO_ACTIVO }))));
  if (!permitido) throw noEncontrado('Grupo');

  const matriculas = await Enrollment.find({ group_id: grupo._id, academic_year_id: grupo.academic_year_id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } }).select('student_id');
  const expedientes = await ExpedienteInclusion.find({
    student_id: { $in: matriculas.map((m) => m.student_id) },
    academic_year_id: grupo.academic_year_id,
    estado: { $in: ['LISTO_PARA_ACUERDO', 'ACTIVO'] },
  }).select('student_id');
  // Solo el hecho de que hay ajustes vigentes: ni la modalidad ni la categoría salen de aquí.
  return expedientes.map((e) => ({ student_id: String(e.student_id), con_ajustes_vigentes: true }));
}
