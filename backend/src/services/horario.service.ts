import { createHash } from 'crypto';
import { Types } from 'mongoose';
import {
  METADATOS_VARIABLE_HORARIO,
  MINUTOS_GENERACION_INTERRUMPIDA,
  SeveridadVariableHorario,
  TipoAlcanceHorario,
  TipoVariableHorario,
} from '../constants/horarios';
import { ESTADOS_MATRICULA_ACTIVOS, EstadoUsuario, Rol } from '../constants/enums';
import Enrollment from '../models/enrollment.model';
import Guardian from '../models/guardian.model';
import StudentGuardian from '../models/studentGuardian.model';
import AcademicYear from '../models/academicYear.model';
import Espacio from '../models/espacio.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import Horario, { HorarioDocument } from '../models/horario.model';
import Institution from '../models/institution.model';
import JornadaOperativa, { JornadaOperativaDocument } from '../models/jornadaOperativa.model';
import Subject from '../models/subject.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import User from '../models/user.model';
import VariableHorario, { VariableHorarioDocument } from '../models/variableHorario.model';
import ApiError from '../utils/ApiError';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import {
  AsignacionMotor,
  Aviso,
  EntradaMotor,
  EstructuraSemana,
  VariableMotor,
  construirEstructura,
  diagnosticarCapacidad,
  evaluarHorario,
  expandirSesiones,
  generarEnHilo,
  Incidencia,
} from '../utils/motorHorarios';
import runTransaction from '../utils/runTransaction';
import { registrarEvento } from './audit.service';

interface ContextoUsuario {
  usuarioId: Types.ObjectId | string;
  ip?: string | null;
}

/** Nombres para mostrar; también traducen los ids que el motor pone en sus mensajes. */
export interface CatalogoHorario {
  grupos: Array<{ _id: string; etiqueta: string; etiqueta_corta: string; grade_id: string }>;
  docentes: Array<{ _id: string; nombre: string }>;
  asignaturas: Array<{ _id: string; nombre: string; abreviatura: string }>;
  espacios: Array<{ _id: string; nombre: string }>;
  reuniones: Array<{ _id: string; nombre: string }>;
}

const TIEMPO_GENERACION_POR_DEFECTO = 10_000;
const NOMBRES_JORNADA: Record<string, string> = { MANANA: 'Mañana', TARDE: 'Tarde', UNICA: 'Única', NOCTURNA: 'Nocturna', SABATINA: 'Sabatina' };

// ------------------------------------------------------------------ contexto

async function exigirAnioYJornada(academicYearId: string, jornadaId: string, escritura: boolean) {
  const [anio, jornada] = await Promise.all([AcademicYear.findById(academicYearId), JornadaOperativa.findById(jornadaId)]);
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  if (!jornada) throw new ApiError(404, 'Jornada no encontrada.');
  if (escritura && anio.estado === 'CERRADO') {
    throw new ApiError(409, 'El año lectivo está cerrado: su horario es histórico y no se modifica.');
  }
  return { anio, jornada };
}

function huellaFranjas(jornada: JornadaOperativaDocument): string {
  const base = JSON.stringify({ dias: [...jornada.dias_habiles].sort(), franjas: jornada.franjas.map((f) => [f.tipo, f.hora_inicio, f.hora_fin]) });
  return createHash('sha1').update(base).digest('hex').slice(0, 16);
}

function aVariableMotor(v: VariableHorarioDocument): VariableMotor {
  return {
    id: String(v._id),
    tipo: v.tipo,
    severidad: v.severidad,
    peso: v.peso,
    alcance: { tipo: v.alcance.tipo, grade_ids: v.alcance.grade_ids.map(String) },
    asignatura_ids: v.asignatura_ids.map(String),
    docente_ids: v.docente_ids.map(String),
    es_excepcion: v.es_excepcion,
    parametros: v.parametros,
  } as VariableMotor;
}

/** Arma los nombres a partir de ids (de la carga actual o de una versión guardada). */
async function construirCatalogo(ids: {
  grupos: Iterable<string>;
  docentes: Iterable<string>;
  asignaturas: Iterable<string>;
  espacios: Iterable<string>;
  reuniones: Iterable<string>;
}): Promise<CatalogoHorario> {
  const lista = (x: Iterable<string>) => [...new Set(x)];
  const [grupos, docentes, asignaturas, espacios, reuniones] = await Promise.all([
    Group.find({ _id: { $in: lista(ids.grupos) } }).select('nomenclatura grade_id').lean(),
    User.find({ _id: { $in: lista(ids.docentes) } }).select('nombre apellido').lean(),
    Subject.find({ _id: { $in: lista(ids.asignaturas) } }).select('nombre abreviatura').lean(),
    Espacio.find({ _id: { $in: lista(ids.espacios) } }).select('nombre').lean(),
    VariableHorario.find({ _id: { $in: lista(ids.reuniones) } }).select('parametros').lean(),
  ]);
  const grados = await Grade.find({ _id: { $in: grupos.map((g) => g.grade_id) } }).select('nombre numero').lean();
  const gradoPorId = new Map(grados.map((g) => [String(g._id), g]));

  return {
    grupos: grupos
      .map((g) => {
        const grado = gradoPorId.get(String(g.grade_id));
        return {
          _id: String(g._id),
          etiqueta: `${grado?.nombre ?? ''} ${g.nomenclatura}`.trim(),
          // Para la sábana general, donde no cabe el nombre completo del grado.
          etiqueta_corta: `${grado?.numero ?? ''}${g.nomenclatura}`,
          grade_id: String(g.grade_id),
          orden: grado?.numero ?? 0,
        };
      })
      .sort((a, b) => a.orden - b.orden || a.etiqueta.localeCompare(b.etiqueta))
      .map(({ orden: _orden, ...g }) => g),
    docentes: docentes
      .map((d) => ({ _id: String(d._id), nombre: `${d.nombre} ${d.apellido}` }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    asignaturas: asignaturas.map((s) => ({ _id: String(s._id), nombre: s.nombre, abreviatura: s.abreviatura })),
    espacios: espacios.map((e) => ({ _id: String(e._id), nombre: e.nombre })),
    reuniones: reuniones.map((r) => ({ _id: String(r._id), nombre: String((r.parametros as { nombre?: string }).nombre ?? 'Reunión') })),
  };
}

/** Reemplaza los ids que el motor escribe en sus mensajes por nombres legibles. */
function crearHumanizador(catalogo: CatalogoHorario, extra: Map<string, string> = new Map()) {
  const nombres = new Map<string, string>(extra);
  for (const g of catalogo.grupos) nombres.set(g._id, g.etiqueta);
  for (const d of catalogo.docentes) nombres.set(d._id, d.nombre);
  for (const s of catalogo.asignaturas) nombres.set(s._id, s.nombre);
  return (texto: string) => texto.replace(/[0-9a-f]{24}(#\d+)?/g, (m) => nombres.get(m.split('#')[0] ?? m) ?? m);
}

/**
 * Lee del sistema todo lo que el motor necesita para una jornada y un año: grupos activos de la jornada, su carga de
 * clase (M08), la estructura de tiempo de la jornada (M01), los espacios disponibles de su sede (M10) y las variables
 * activas. El motor recibe todo con ids string y no vuelve a tocar la base de datos.
 */
async function cargarContexto(academicYearId: string, jornadaId: string) {
  const { anio, jornada } = await exigirAnioYJornada(academicYearId, jornadaId, false);
  const estructura = construirEstructura(jornada.dias_habiles, jornada.franjas);

  const grupos = await Group.find({ academic_year_id: anio._id, jornada_id: jornada._id, estado: 'ACTIVE' }).select('grade_id').lean();
  const gradoDeGrupo = new Map(grupos.map((g) => [String(g._id), String(g.grade_id)]));

  const [asignaciones, variablesDocs, institucion] = await Promise.all([
    TeacherAssignment.find({
      academic_year_id: anio._id,
      tipo_asignacion: 'CLASE',
      estado: ESTADO_ACTIVO,
      group_id: { $in: grupos.map((g) => g._id) },
      subject_id: { $ne: null },
    }).lean(),
    VariableHorario.find({ academic_year_id: anio._id, jornada_id: jornada._id, estado: ESTADO_ACTIVO }).sort({ updatedAt: 1 }),
    Institution.findOne().select('modalidad').lean(),
  ]);
  const espaciosDocs =
    institucion?.modalidad === 'VIRTUAL' ? [] : await Espacio.find({ sede_id: jornada.sede_id, estado: 'DISPONIBLE' }).lean();

  const asignacionesMotor: AsignacionMotor[] = asignaciones.map((a) => ({
    id: String(a._id),
    docente_id: String(a.docente_id),
    group_id: String(a.group_id),
    grade_id: gradoDeGrupo.get(String(a.group_id)) ?? '',
    subject_id: String(a.subject_id),
    horas_semanales: a.horas_semanales,
  }));

  const avisos: Aviso[] = [];
  const asignaturasIds = new Set(asignacionesMotor.map((a) => a.subject_id));
  for (const v of variablesDocs) for (const s of v.asignatura_ids) asignaturasIds.add(String(s));
  const areaDeAsignatura = new Map(
    (await Subject.find({ _id: { $in: [...asignaturasIds] } }).select('area_id').lean()).map((s) => [String(s._id), String(s.area_id)])
  );

  // Un espacio con áreas exclusivas (M10) solo sirve a asignaturas de esas áreas: se quita de las variables que no las cumplen.
  const espacioPorId = new Map(espaciosDocs.map((e) => [String(e._id), e]));
  const variables: VariableMotor[] = [];
  for (const doc of variablesDocs) {
    const v = aVariableMotor(doc);
    if (v.tipo === 'ESPACIO_REQUERIDO') {
      const usables = v.parametros.espacio_ids.filter((id) => {
        const e = espacioPorId.get(id);
        if (!e) return false;
        if (e.areas_exclusivas.length === 0) return true;
        const exclusivas = e.areas_exclusivas.map(String);
        return v.asignatura_ids.length > 0 && v.asignatura_ids.every((s) => exclusivas.includes(areaDeAsignatura.get(s) ?? ''));
      });
      if (usables.length === 0) {
        avisos.push({
          codigo: 'ESPACIO_NO_DISPONIBLE',
          mensaje: `La variable "${doc.descripcion || METADATOS_VARIABLE_HORARIO[v.tipo].etiqueta}" no tiene ningún espacio disponible para sus asignaturas (en mantenimiento, inactivo o exclusivo de otra área); no se aplicó.`,
        });
        continue;
      }
      v.parametros = { espacio_ids: usables };
    }
    variables.push(v);
  }

  const { sesiones, avisos: avisosExpansion } = expandirSesiones(asignacionesMotor, variables, estructura);
  avisos.push(...avisosExpansion, ...diagnosticarCapacidad(sesiones, variables, estructura));

  const entrada: EntradaMotor = {
    estructura,
    sesiones,
    variables,
    espacios: espaciosDocs.map((e) => ({ id: String(e._id), admite_grupos_simultaneos: e.admite_grupos_simultaneos })),
  };

  const catalogo = await construirCatalogo({
    grupos: gradoDeGrupo.keys(),
    docentes: sesiones.flatMap((s) => s.docente_ids),
    asignaturas: asignaturasIds,
    espacios: espacioPorId.keys(),
    reuniones: variables.filter((v) => v.tipo === 'REUNION_COLECTIVA').map((v) => v.id),
  });
  const etiquetasAsignacion = new Map<string, string>();
  for (const a of asignacionesMotor) {
    const asig = catalogo.asignaturas.find((s) => s._id === a.subject_id)?.nombre ?? 'Asignatura';
    const grupo = catalogo.grupos.find((g) => g._id === a.group_id)?.etiqueta ?? '';
    etiquetasAsignacion.set(a.id, `${asig} de ${grupo}`);
  }
  const humanizar = crearHumanizador(catalogo, etiquetasAsignacion);

  return {
    anio,
    jornada,
    estructura,
    entrada,
    catalogo,
    humanizar,
    avisos: avisos.map((a) => ({ ...a, mensaje: humanizar(a.mensaje) })),
    huella: huellaFranjas(jornada),
  };
}

function aIncidencias(incidencias: readonly Incidencia[], humanizar: (t: string) => string) {
  return incidencias.map((i) => ({
    codigo: i.codigo,
    variable_id: i.variable_id,
    dura: i.dura,
    magnitud: i.magnitud,
    claves_sesion: i.sesion_ids,
    mensaje: humanizar(i.mensaje),
  }));
}

// ------------------------------------------------------------------ variables

export interface VariableInput {
  academic_year_id: string;
  jornada_id: string;
  tipo: TipoVariableHorario;
  descripcion?: string;
  severidad?: SeveridadVariableHorario;
  peso?: number;
  alcance?: { tipo: TipoAlcanceHorario; grade_ids: string[] };
  asignatura_ids?: string[];
  docente_ids?: string[];
  es_excepcion?: boolean;
  parametros: Record<string, unknown>;
}

export type ActualizarVariableInput = Partial<Omit<VariableInput, 'academic_year_id' | 'jornada_id'>> & { tipo: TipoVariableHorario };

export interface ListarPorContexto {
  academic_year_id: string;
  jornada_id: string;
}

/** Lo que Joi no puede saber: que asignaturas, docentes, espacios y celdas existan en esta institución y jornada. */
async function validarReferencias(
  datos: { tipo: TipoVariableHorario; asignatura_ids: string[]; docente_ids: string[]; parametros: Record<string, unknown> },
  jornada: JornadaOperativaDocument
): Promise<void> {
  if (datos.asignatura_ids.length > 0) {
    const n = await Subject.countDocuments({ _id: { $in: datos.asignatura_ids } });
    if (n !== datos.asignatura_ids.length) throw new ApiError(400, 'Una o más asignaturas no existen.');
  }
  if (datos.docente_ids.length > 0) {
    const n = await User.countDocuments({ _id: { $in: datos.docente_ids }, rol: 'DOCENTE' });
    if (n !== datos.docente_ids.length) throw new ApiError(400, 'Uno o más docentes no existen o no tienen rol docente.');
  }
  if (datos.tipo === 'REUNION_COLECTIVA' && datos.docente_ids.length === 0) {
    throw new ApiError(400, 'Una reunión necesita al menos un docente.');
  }
  if (datos.tipo === 'DISPONIBILIDAD') {
    const estructura = construirEstructura(jornada.dias_habiles, jornada.franjas);
    if (estructura.periodos.length === 0) {
      throw new ApiError(409, 'La jornada aún no tiene franjas de clase. Defínelas en Sedes y jornadas antes de marcar tiempo libre.');
    }
    const celdas = datos.parametros.celdas as Array<{ dia: number; periodo: number }>;
    const fuera = celdas.find((c) => !estructura.dias.includes(c.dia) || c.periodo >= estructura.periodos.length);
    if (fuera) throw new ApiError(400, `La celda día ${fuera.dia}, periodo ${fuera.periodo + 1} no existe en esta jornada.`);
  }
  if (datos.tipo === 'ESPACIO_REQUERIDO') {
    const ids = datos.parametros.espacio_ids as string[];
    const n = await Espacio.countDocuments({ _id: { $in: ids }, sede_id: jornada.sede_id });
    if (n !== ids.length) throw new ApiError(400, 'Uno o más espacios no existen en la sede de esta jornada.');
  }
}

export async function listarVariables(query: ListarPorContexto) {
  return VariableHorario.find({ academic_year_id: query.academic_year_id, jornada_id: query.jornada_id }).sort({ createdAt: 1 }).lean();
}

export async function crearVariable(input: VariableInput, { usuarioId, ip }: ContextoUsuario): Promise<VariableHorarioDocument> {
  const { jornada } = await exigirAnioYJornada(input.academic_year_id, input.jornada_id, true);
  const datos = {
    ...input,
    severidad: input.severidad ?? METADATOS_VARIABLE_HORARIO[input.tipo].severidadPorDefecto,
    alcance: input.alcance ?? { tipo: 'GLOBAL' as const, grade_ids: [] },
    asignatura_ids: input.asignatura_ids ?? [],
    docente_ids: input.docente_ids ?? [],
  };
  await validarReferencias(datos, jornada);
  const variable = await VariableHorario.create({ ...datos, creado_por: usuarioId });
  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'VARIABLE_HORARIO_CREADA',
    entidad: 'VariableHorario',
    entidad_id: variable._id,
    detalle: `${METADATOS_VARIABLE_HORARIO[variable.tipo].etiqueta}${variable.descripcion ? `: ${variable.descripcion}` : ''}`,
    ip,
  });
  return variable;
}

async function exigirVariableEditable(id: string) {
  const variable = await VariableHorario.findById(id);
  if (!variable) throw new ApiError(404, 'Variable no encontrada.');
  const { jornada } = await exigirAnioYJornada(String(variable.academic_year_id), String(variable.jornada_id), true);
  return { variable, jornada };
}

export async function actualizarVariable(id: string, input: ActualizarVariableInput, { usuarioId, ip }: ContextoUsuario) {
  const { variable, jornada } = await exigirVariableEditable(id);
  if (input.tipo !== variable.tipo) throw new ApiError(400, 'El tipo de una variable no se cambia: crea una nueva.');

  if (input.descripcion !== undefined) variable.descripcion = input.descripcion;
  if (input.severidad !== undefined) variable.severidad = input.severidad;
  if (input.peso !== undefined) variable.peso = input.peso;
  if (input.es_excepcion !== undefined) variable.es_excepcion = input.es_excepcion;
  if (input.parametros !== undefined) variable.parametros = input.parametros;
  if (input.alcance !== undefined) {
    variable.alcance = { tipo: input.alcance.tipo, grade_ids: input.alcance.grade_ids.map((g) => new Types.ObjectId(g)) };
  }
  if (input.asignatura_ids !== undefined) variable.asignatura_ids = input.asignatura_ids.map((a) => new Types.ObjectId(a));
  if (input.docente_ids !== undefined) variable.docente_ids = input.docente_ids.map((d) => new Types.ObjectId(d));
  variable.markModified('parametros');

  await validarReferencias(
    { tipo: variable.tipo, asignatura_ids: variable.asignatura_ids.map(String), docente_ids: variable.docente_ids.map(String), parametros: variable.parametros },
    jornada
  );
  await variable.save();
  await registrarEvento({ usuario_id: usuarioId, accion: 'VARIABLE_HORARIO_ACTUALIZADA', entidad: 'VariableHorario', entidad_id: variable._id, ip });
  return variable;
}

export async function cambiarEstadoVariable(id: string, estado: EstadoUsuario, { usuarioId, ip }: ContextoUsuario) {
  const { variable } = await exigirVariableEditable(id);
  variable.estado = estado;
  await variable.save();
  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'VARIABLE_HORARIO_ACTUALIZADA',
    entidad: 'VariableHorario',
    entidad_id: variable._id,
    detalle: `Estado: ${estado}`,
    ip,
  });
  return variable;
}

export async function eliminarVariable(id: string, { usuarioId, ip }: ContextoUsuario): Promise<void> {
  const { variable } = await exigirVariableEditable(id);
  await variable.deleteOne();
  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'VARIABLE_HORARIO_ELIMINADA',
    entidad: 'VariableHorario',
    entidad_id: variable._id,
    detalle: METADATOS_VARIABLE_HORARIO[variable.tipo].etiqueta,
    ip,
  });
}

// ------------------------------------------------------------------ insumos

export async function obtenerInsumos(query: ListarPorContexto) {
  const ctx = await cargarContexto(query.academic_year_id, query.jornada_id);
  const periodosSemana = ctx.estructura.dias.length * ctx.estructura.periodos.length;

  const horasGrupo = new Map<string, number>();
  const horasDocente = new Map<string, number>();
  for (const s of ctx.entrada.sesiones) {
    if (s.group_id) horasGrupo.set(s.group_id, (horasGrupo.get(s.group_id) ?? 0) + s.duracion);
    for (const d of s.docente_ids) horasDocente.set(d, (horasDocente.get(d) ?? 0) + s.duracion);
  }

  return {
    estructura: ctx.estructura,
    periodos_semana: periodosSemana,
    total_sesiones: ctx.entrada.sesiones.length,
    grupos: ctx.catalogo.grupos.map((g) => ({ ...g, horas: horasGrupo.get(g._id) ?? 0 })),
    docentes: ctx.catalogo.docentes.map((d) => ({ ...d, horas: horasDocente.get(d._id) ?? 0 })),
    avisos: ctx.avisos,
    catalogo: ctx.catalogo,
  };
}

// ------------------------------------------------------------------ versiones

export interface GenerarInput extends ListarPorContexto {
  nombre?: string;
  semilla?: number;
  tiempo_max_ms?: number;
  /** Versión de la que se copian las sesiones fijadas a mano (regenerar respetando las fijas). */
  base_horario_id?: string;
}

/**
 * Crea la versión en GENERANDO y responde de inmediato; el motor corre en un worker thread y, al terminar, la deja en
 * BORRADOR (o FALLIDO). El frontend consulta la lista hasta que cambie de estado. Una sola generación a la vez por jornada.
 */
export async function generarHorario(input: GenerarInput, { usuarioId, ip }: ContextoUsuario): Promise<HorarioDocument> {
  await exigirAnioYJornada(input.academic_year_id, input.jornada_id, true);
  await marcarGeneracionesInterrumpidas();
  const enCurso = await Horario.exists({ academic_year_id: input.academic_year_id, jornada_id: input.jornada_id, estado: 'GENERANDO' });
  if (enCurso) throw new ApiError(409, 'Ya se está generando un horario para esta jornada. Espera a que termine.');

  const ctx = await cargarContexto(input.academic_year_id, input.jornada_id);
  if (ctx.estructura.periodos.length === 0 || ctx.estructura.dias.length === 0) {
    throw new ApiError(409, 'La jornada no tiene franjas de clase o días hábiles. Configúralos en Sedes y jornadas.');
  }
  if (ctx.entrada.sesiones.length === 0) {
    throw new ApiError(409, 'No hay carga para programar: asigna docentes a las asignaturas de los grupos de esta jornada en Carga académica.');
  }

  const avisos = [...ctx.avisos];
  if (input.base_horario_id) {
    const base = await Horario.findById(input.base_horario_id).select('jornada_id huella_franjas sesiones');
    if (!base || String(base.jornada_id) !== String(ctx.jornada._id)) throw new ApiError(400, 'La versión base no es de esta jornada.');
    if (base.huella_franjas !== ctx.huella) throw new ApiError(409, 'Las franjas cambiaron desde la versión base: sus sesiones fijas ya no aplican.');
    const porClave = new Map(ctx.entrada.sesiones.map((x) => [x.id, x]));
    let perdidas = 0;
    for (const f of base.sesiones.filter((x) => x.fija)) {
      const sesion = porClave.get(f.clave);
      if (sesion) sesion.fija = { dia: f.dia, periodo: f.periodo };
      else perdidas += 1;
    }
    if (perdidas > 0) {
      avisos.push({ codigo: 'FIJAS_PERDIDAS', mensaje: `${perdidas} sesión(es) fijada(s) ya no existen en la carga actual y no se conservaron.` });
    }
  }

  const ultima = await Horario.findOne({ academic_year_id: ctx.anio._id, jornada_id: ctx.jornada._id }).sort({ version: -1 }).select('version');
  const version = (ultima?.version ?? 0) + 1;
  const horario = await Horario.create({
    academic_year_id: ctx.anio._id,
    sede_id: ctx.jornada.sede_id,
    jornada_id: ctx.jornada._id,
    version,
    nombre: input.nombre?.trim() || `Versión ${version}`,
    estado: 'GENERANDO',
    avisos,
    huella_franjas: ctx.huella,
    creado_por: usuarioId,
  });

  void completarGeneracion(horario._id, ctx, avisos, input, { usuarioId, ip });
  return horario;
}

async function completarGeneracion(
  horarioId: Types.ObjectId,
  ctx: Awaited<ReturnType<typeof cargarContexto>>,
  avisos: Array<{ codigo: string; mensaje: string }>,
  input: GenerarInput,
  { usuarioId, ip }: ContextoUsuario
): Promise<void> {
  try {
    const resultado = await generarEnHilo(ctx.entrada, {
      semilla: input.semilla,
      tiempo_max_ms: input.tiempo_max_ms ?? TIEMPO_GENERACION_POR_DEFECTO,
    });
    const sesionPorId = new Map(ctx.entrada.sesiones.map((x) => [x.id, x]));
    await Horario.updateOne(
      { _id: horarioId },
      {
        $set: {
          estado: 'BORRADOR',
          sesiones: resultado.ubicaciones.map((u) => {
            const x = sesionPorId.get(u.sesion_id)!;
            return {
              clave: x.id,
              asignacion_id: x.asignacion_id,
              reunion_variable_id: x.reunion_variable_id,
              group_id: x.group_id,
              subject_id: x.subject_id,
              docente_ids: x.docente_ids,
              dia: u.dia,
              periodo: u.periodo,
              duracion: x.duracion,
              espacio_id: u.espacio_id,
              fija: x.fija !== null,
            };
          }),
          conflictos_duros: resultado.conflictos_duros,
          penalizacion_blanda: resultado.penalizacion_blanda,
          incidencias: aIncidencias(resultado.incidencias, ctx.humanizar),
          avisos: [...avisos, ...resultado.avisos.map((a) => ({ ...a, mensaje: ctx.humanizar(a.mensaje) }))],
          generacion: resultado.estadisticas,
        },
      }
    );
    await registrarEvento({
      usuario_id: usuarioId,
      accion: 'HORARIO_GENERADO',
      entidad: 'Horario',
      entidad_id: horarioId,
      detalle: `${resultado.conflictos_duros} conflicto(s) duro(s), penalización ${resultado.penalizacion_blanda}.`,
      ip,
    });
  } catch (err) {
    console.error('Falló la generación del horario:', err);
    await Horario.updateOne(
      { _id: horarioId },
      { $set: { estado: 'FALLIDO', error_generacion: 'El motor de horarios falló. Intenta de nuevo; si se repite, revisa el registro del servidor.' } }
    ).catch(() => undefined);
  }
}

/** Si el servidor se reinició a mitad de una generación, esa versión quedaría en GENERANDO para siempre. */
async function marcarGeneracionesInterrumpidas(): Promise<void> {
  await Horario.updateMany(
    { estado: 'GENERANDO', updatedAt: { $lt: new Date(Date.now() - MINUTOS_GENERACION_INTERRUMPIDA * 60_000) } },
    { $set: { estado: 'FALLIDO', error_generacion: 'La generación se interrumpió (el servidor se reinició). Genera de nuevo.' } }
  );
}

export async function listarHorarios(query: ListarPorContexto) {
  await marcarGeneracionesInterrumpidas();
  return Horario.find({ academic_year_id: query.academic_year_id, jornada_id: query.jornada_id })
    .select('-sesiones -incidencias')
    .sort({ version: -1 })
    .lean();
}

/** Una versión con lo necesario para pintarla: estructura de la jornada y nombres de lo que aparece en sus sesiones. */
export async function obtenerHorario(id: string, filtro?: (s: { group_id: Types.ObjectId | null; docente_ids: Types.ObjectId[] }) => boolean) {
  const encontrado = await Horario.findById(id).lean();
  if (!encontrado) throw new ApiError(404, 'Horario no encontrado.');
  // Vistas personales (docente, estudiante, acudiente): solo las sesiones propias, con su catálogo.
  const horario = filtro ? { ...encontrado, sesiones: encontrado.sesiones.filter(filtro), incidencias: [] } : encontrado;
  const jornada = await JornadaOperativa.findById(horario.jornada_id);
  if (!jornada) throw new ApiError(404, 'La jornada de este horario ya no existe.');

  const catalogo = await construirCatalogo({
    grupos: horario.sesiones.flatMap((s) => (s.group_id ? [String(s.group_id)] : [])),
    docentes: horario.sesiones.flatMap((s) => s.docente_ids.map(String)),
    asignaturas: horario.sesiones.flatMap((s) => (s.subject_id ? [String(s.subject_id)] : [])),
    espacios: horario.sesiones.flatMap((s) => (s.espacio_id ? [String(s.espacio_id)] : [])),
    reuniones: horario.sesiones.flatMap((s) => (s.reunion_variable_id ? [String(s.reunion_variable_id)] : [])),
  });

  return {
    horario,
    estructura: construirEstructura(jornada.dias_habiles, jornada.franjas) satisfies EstructuraSemana,
    catalogo,
    franjas_cambiaron: huellaFranjas(jornada) !== horario.huella_franjas,
  };
}

/**
 * Publica una versión. Antes la revalida contra los insumos de HOY (carga de M08, franjas, variables): si algo cambió
 * desde que se generó y ya no cuadra, no se publica. Exige la contraseña del usuario, como el cierre de año.
 */
export async function publicarHorario(id: string, confirmPassword: string, { usuarioId, ip }: ContextoUsuario) {
  const horario = await Horario.findById(id);
  if (!horario) throw new ApiError(404, 'Horario no encontrado.');
  if (horario.estado === 'PUBLICADO') throw new ApiError(409, 'Esta versión ya está publicada.');
  if (horario.estado === 'GENERANDO' || horario.estado === 'FALLIDO') throw new ApiError(409, 'Esta versión no tiene un horario completo para publicar.');
  await exigirAnioYJornada(String(horario.academic_year_id), String(horario.jornada_id), true);

  const usuario = await User.findById(usuarioId).select('+password_hash');
  if (!usuario || !(await usuario.comparePassword(confirmPassword))) throw new ApiError(401, 'Contraseña incorrecta.');

  const ctx = await cargarContexto(String(horario.academic_year_id), String(horario.jornada_id));
  if (ctx.huella !== horario.huella_franjas) {
    throw new ApiError(409, 'Las franjas o los días de la jornada cambiaron después de generar esta versión. Genera una nueva.');
  }
  const revision = evaluarHorario(
    ctx.entrada,
    horario.sesiones.map((s) => ({ sesion_id: s.clave, dia: s.dia, periodo: s.periodo }))
  );
  horario.conflictos_duros = revision.conflictos_duros;
  horario.penalizacion_blanda = revision.penalizacion_blanda;
  horario.set('incidencias', aIncidencias(revision.incidencias, ctx.humanizar));
  if (revision.conflictos_duros > 0) {
    await horario.save();
    const cambios = revision.sin_ubicar.length > 0 ? ' La carga académica o las variables cambiaron desde que se generó.' : '';
    throw new ApiError(409, `La versión tiene ${revision.conflictos_duros} conflicto(s) duro(s) con los datos actuales.${cambios} Revisa los conflictos o genera una nueva versión.`);
  }

  await runTransaction(async (session) => {
    await Horario.updateMany(
      { academic_year_id: horario.academic_year_id, jornada_id: horario.jornada_id, estado: 'PUBLICADO' },
      { $set: { estado: 'ARCHIVADO' } },
      { session }
    );
    horario.estado = 'PUBLICADO';
    horario.publicado_por = new Types.ObjectId(String(usuarioId));
    horario.publicado_en = new Date();
    await horario.save({ session });
  });

  await registrarEvento({ usuario_id: usuarioId, accion: 'HORARIO_PUBLICADO', entidad: 'Horario', entidad_id: horario._id, detalle: horario.nombre, ip });
  return horario;
}

export async function eliminarHorario(id: string, { usuarioId, ip }: ContextoUsuario): Promise<void> {
  const horario = await Horario.findById(id);
  if (!horario) throw new ApiError(404, 'Horario no encontrado.');
  if (horario.estado === 'PUBLICADO') throw new ApiError(409, 'La versión publicada no se elimina: publica otra primero.');
  if (horario.estado === 'GENERANDO') throw new ApiError(409, 'Espera a que termine de generarse.');
  await exigirAnioYJornada(String(horario.academic_year_id), String(horario.jornada_id), true);
  await horario.deleteOne();
  await registrarEvento({ usuario_id: usuarioId, accion: 'HORARIO_ELIMINADO', entidad: 'Horario', entidad_id: horario._id, detalle: horario.nombre, ip });
}

// ------------------------------------------------------------------ edición manual

export interface EditarSesionInput {
  dia?: number;
  periodo?: number;
  fija?: boolean;
  /** Otra sesión de igual duración: cada una toma el lugar de la otra (con grupos de semana llena no hay franjas libres). */
  intercambiar_con?: string;
}

/**
 * Mueve y/o fija una sesión de un borrador y revalida toda la versión contra los insumos actuales (también reasigna los
 * espacios). Moverla a mano la deja fijada por omisión, para que una regeneración respete esa decisión.
 */
export async function editarSesion(id: string, sesionId: string, input: EditarSesionInput, { usuarioId, ip }: ContextoUsuario) {
  const horario = await Horario.findById(id);
  if (!horario) throw new ApiError(404, 'Horario no encontrado.');
  if (horario.estado !== 'BORRADOR') throw new ApiError(409, 'Solo se edita un borrador. Genera una versión nueva para cambiar la publicada.');
  await exigirAnioYJornada(String(horario.academic_year_id), String(horario.jornada_id), true);
  const sesion = horario.sesiones.find((x) => String(x._id) === sesionId);
  if (!sesion) throw new ApiError(404, 'Sesión no encontrada en esta versión.');

  const ctx = await cargarContexto(String(horario.academic_year_id), String(horario.jornada_id));
  if (ctx.huella !== horario.huella_franjas) {
    throw new ApiError(409, 'Las franjas de la jornada cambiaron después de generar esta versión. Genera una nueva.');
  }

  let mueve = input.dia !== undefined || input.periodo !== undefined;
  if (input.intercambiar_con) {
    const otra = horario.sesiones.find((x) => String(x._id) === input.intercambiar_con);
    if (!otra) throw new ApiError(404, 'La sesión con la que se intercambia no está en esta versión.');
    if (otra.duracion !== sesion.duracion) throw new ApiError(400, 'Solo se intercambian sesiones de la misma duración.');
    [sesion.dia, otra.dia] = [otra.dia, sesion.dia];
    [sesion.periodo, otra.periodo] = [otra.periodo, sesion.periodo];
    otra.fija = true;
    mueve = true;
  } else if (mueve) {
    const dia = input.dia ?? sesion.dia;
    const periodo = input.periodo ?? sesion.periodo;
    if (!ctx.estructura.dias.includes(dia)) throw new ApiError(400, 'Ese día no es hábil en esta jornada.');
    if (periodo < 0 || periodo + sesion.duracion > ctx.estructura.periodos.length) {
      throw new ApiError(400, `Un bloque de ${sesion.duracion} hora(s) no cabe desde ese periodo.`);
    }
    sesion.dia = dia;
    sesion.periodo = periodo;
  }
  sesion.fija = input.fija ?? (mueve ? true : sesion.fija);

  const revision = evaluarHorario(
    ctx.entrada,
    horario.sesiones.map((x) => ({ sesion_id: x.clave, dia: x.dia, periodo: x.periodo }))
  );
  for (const x of horario.sesiones) {
    if (x.clave in revision.espacios) x.espacio_id = revision.espacios[x.clave] ? new Types.ObjectId(revision.espacios[x.clave]!) : null;
  }
  horario.conflictos_duros = revision.conflictos_duros;
  horario.penalizacion_blanda = revision.penalizacion_blanda;
  horario.set('incidencias', aIncidencias(revision.incidencias, ctx.humanizar));
  await horario.save();

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'HORARIO_EDITADO',
    entidad: 'Horario',
    entidad_id: horario._id,
    detalle: `${sesion.clave}: ${mueve ? `día ${sesion.dia}, periodo ${sesion.periodo + 1}` : ''}${sesion.fija ? ' (fija)' : ''}`.trim(),
    ip,
  });
  return obtenerHorario(id);
}

// ------------------------------------------------------------------ consulta personal

/** Año sobre el que se consulta: la vigencia EN_CURSO o, si no hay, el más reciente sin cerrar (como el frontend). */
async function anioDeConsulta() {
  return (
    (await AcademicYear.findOne({ estado: 'EN_CURSO' })) ?? (await AcademicYear.findOne({ estado: { $ne: 'CERRADO' } }).sort({ year: -1 }))
  );
}

/** Grupos que un estudiante o acudiente puede consultar en un año, con un título para cada uno. */
export async function gruposDelUsuario(usuario: { _id: Types.ObjectId; rol: Rol }, anioId: Types.ObjectId) {
  let estudiantes: Types.ObjectId[] = [];
  if (usuario.rol === 'ESTUDIANTE') estudiantes = [usuario._id];
  if (usuario.rol === 'ACUDIENTE') {
    const acudientes = await Guardian.find({ user_id: usuario._id }).select('_id').lean();
    const vinculos = await StudentGuardian.find({ guardian_id: { $in: acudientes.map((a) => a._id) } }).select('student_id').lean();
    estudiantes = vinculos.map((v) => v.student_id);
  }
  if (estudiantes.length === 0) return [];
  const matriculas = await Enrollment.find({
    student_id: { $in: estudiantes },
    academic_year_id: anioId,
    estado: { $in: ESTADOS_MATRICULA_ACTIVOS },
  })
    .select('student_id group_id')
    .lean();
  const nombres = new Map(
    (await User.find({ _id: { $in: matriculas.map((m) => m.student_id) } }).select('nombre apellido').lean()).map((u) => [String(u._id), `${u.nombre} ${u.apellido}`])
  );
  return matriculas.map((m) => ({ group_id: String(m.group_id), estudiante: usuario.rol === 'ACUDIENTE' ? (nombres.get(String(m.student_id)) ?? '') : null }));
}

/**
 * Horarios PUBLICADOS que le corresponden a quien consulta: al docente, sus clases en cada jornada; al estudiante, el de su
 * grupo; al acudiente, el de cada estudiante a cargo. Solo se envían las sesiones propias.
 */
export async function miHorario(usuario: { _id: Types.ObjectId; rol: Rol }) {
  const anio = await anioDeConsulta();
  if (!anio) return [];

  if (usuario.rol === 'DOCENTE') {
    const publicados = await Horario.find({ academic_year_id: anio._id, estado: 'PUBLICADO', 'sesiones.docente_ids': usuario._id }).select('_id jornada_id');
    const vistas = [];
    for (const h of publicados) {
      const jornada = await JornadaOperativa.findById(h.jornada_id).select('nombre');
      const detalle = await obtenerHorario(String(h._id), (x) => x.docente_ids.some((d) => String(d) === String(usuario._id)));
      vistas.push({ titulo: `Jornada ${jornada ? (NOMBRES_JORNADA[jornada.nombre] ?? jornada.nombre) : ''}`.trim(), vista: 'DOCENTE' as const, entidad_id: String(usuario._id), ...detalle });
    }
    return vistas;
  }

  const grupos = await gruposDelUsuario(usuario, anio._id);
  const vistas = [];
  for (const g of grupos) {
    const grupo = await Group.findById(g.group_id).select('jornada_id');
    if (!grupo) continue;
    const publicado = await Horario.findOne({ academic_year_id: anio._id, jornada_id: grupo.jornada_id, estado: 'PUBLICADO' }).select('_id');
    if (!publicado) continue;
    const detalle = await obtenerHorario(String(publicado._id), (x) => String(x.group_id) === g.group_id);
    const etiqueta = detalle.catalogo.grupos.find((x) => x._id === g.group_id)?.etiqueta ?? '';
    vistas.push({ titulo: g.estudiante ? `${g.estudiante} · ${etiqueta}` : etiqueta, vista: 'GRUPO' as const, entidad_id: g.group_id, ...detalle });
  }
  return vistas;
}
