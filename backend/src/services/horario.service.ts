import { createHash } from 'crypto';
import { Types } from 'mongoose';
import {
  ColorAsignatura,
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
import Campus from '../models/campus.model';
import Espacio from '../models/espacio.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import Horario, { HorarioDocument } from '../models/horario.model';
import Institution from '../models/institution.model';
import JornadaOperativa, { JornadaOperativaDocument } from '../models/jornadaOperativa.model';
import StudyPlan from '../models/studyPlan.model';
import Subject from '../models/subject.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import User from '../models/user.model';
import VariableHorario, { VariableHorarioDocument } from '../models/variableHorario.model';
import ApiError from '../utils/ApiError';
import { asignarColoresAsignaturas } from '../utils/coloresHorario';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import {
  celdasBloqueadasPorOcupaciones,
  conciliarCargaConPlan,
  horasDelPlanDeGrupo,
  jornadasSeTraslapan,
  ocupacionesDeSesiones,
  resumirLista,
} from '../utils/horarioCoherencia';
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
  /** `nombre_corto` («J. Pérez») es para las celdas de las hojas totales, donde no cabe el nombre completo. */
  docentes: Array<{ _id: string; nombre: string; nombre_corto: string }>;
  asignaturas: Array<{ _id: string; nombre: string; abreviatura: string; color: ColorAsignatura }>;
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
  const colores = asignarColoresAsignaturas(asignaturas.map((s) => String(s._id)));

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
      .map((d) => ({
        _id: String(d._id),
        nombre: `${d.nombre} ${d.apellido}`,
        nombre_corto: `${d.nombre.trim().charAt(0)}. ${d.apellido.trim().split(/\s+/)[0] ?? ''}`,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    asignaturas: asignaturas.map((s) => ({
      _id: String(s._id),
      nombre: s.nombre,
      abreviatura: s.abreviatura,
      color: colores.get(String(s._id))!,
    })),
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

const ESTADOS_ESPACIO_NO_USABLES = ['EN_MANTENIMIENTO', 'INACTIVO'];

/**
 * Docentes (M08) con lo que el motor de UNA jornada no puede ver: si ya no están activos, o si dictan también en otra
 * jornada (de esta u otra sede) cuyas horas se cruzan con esta, caso en que no podrían estar en los dos lugares a la vez.
 */
async function avisosDeDocentes(
  docenteIds: string[],
  academicYearId: Types.ObjectId,
  jornada: JornadaOperativaDocument,
  gruposDeEstaJornada: Types.ObjectId[],
  /** Jornadas cuyo horario ya se tiene en cuenta al generar (ver `restriccionesDeOtrasJornadas`): no hay nada que avisar de ellas. */
  jornadasRespetadas: ReadonlySet<string>
): Promise<Aviso[]> {
  if (docenteIds.length === 0) return [];
  const avisos: Aviso[] = [];

  const inactivos = await User.find({ _id: { $in: docenteIds }, estado: 'inactivo' }).select('_id').lean();
  if (inactivos.length > 0) {
    avisos.push({
      codigo: 'DOCENTE_INACTIVO',
      mensaje: `Tienen clases asignadas pero ya no están activos: ${resumirLista(inactivos.map((d) => String(d._id)))}. Reasigna sus clases en Carga académica.`,
    });
  }

  const enOtrosGrupos = await TeacherAssignment.find({
    academic_year_id: academicYearId,
    tipo_asignacion: 'CLASE',
    estado: ESTADO_ACTIVO,
    docente_id: { $in: docenteIds },
    group_id: { $nin: gruposDeEstaJornada, $ne: null },
  })
    .select('docente_id group_id')
    .lean();
  if (enOtrosGrupos.length === 0) return avisos;

  const gruposOtros = await Group.find({
    _id: { $in: enOtrosGrupos.map((a) => a.group_id) },
    estado: { $ne: 'CLOSED' },
    jornada_id: { $ne: jornada._id },
  })
    .select('jornada_id')
    .lean();
  const jornadaDeGrupo = new Map(gruposOtros.map((g) => [String(g._id), String(g.jornada_id)]));
  const jornadasOtras = await JornadaOperativa.find({ _id: { $in: [...new Set(jornadaDeGrupo.values())] } }).lean();
  const sedes = new Map((await Campus.find({ _id: { $in: jornadasOtras.map((j) => j.sede_id) } }).select('nombre').lean()).map((c) => [String(c._id), c.nombre]));
  const cruzadas = new Map(jornadasOtras.filter((j) => jornadasSeTraslapan(jornada, j) && !jornadasRespetadas.has(String(j._id))).map((j) => [String(j._id), j]));

  const porDocente = new Map<string, Set<string>>();
  for (const a of enOtrosGrupos) {
    const otra = jornadaDeGrupo.get(String(a.group_id));
    if (!otra || !cruzadas.has(otra)) continue;
    porDocente.set(String(a.docente_id), (porDocente.get(String(a.docente_id)) ?? new Set()).add(otra));
  }
  for (const [docente, jornadasIds] of porDocente) {
    const donde = [...jornadasIds].map((id) => {
      const j = cruzadas.get(id)!;
      return `${NOMBRES_JORNADA[j.nombre] ?? j.nombre} de ${sedes.get(String(j.sede_id)) ?? 'otra sede'} (${j.hora_inicio}–${j.hora_fin})`;
    });
    avisos.push({
      codigo: 'DOCENTE_EN_JORNADAS_QUE_SE_CRUZAN',
      mensaje: `El docente ${docente} también dicta en ${donde.join(' y ')}, que se cruza con esta jornada (${jornada.hora_inicio}–${jornada.hora_fin}), pero aún no hay un horario válido de esa jornada que respetar. Genera uno de los dos primero: el segundo se arma sin pisar las horas que el docente ya tiene en el otro.`,
    });
  }
  return avisos;
}

/**
 * Un docente que dicta en dos jornadas que se cruzan (p. ej. Mañana para secundaria y Única para media técnica) no puede estar en
 * dos clases a la misma hora. Cada jornada se genera por separado, así que al armar esta se leen los horarios ya hechos de las
 * otras (el publicado y, si no hay, el borrador más reciente) y las horas que el docente tiene allí quedan como franjas
 * NO disponibles (variables DURAS internas, `ext:<docente>`, que no se guardan ni salen en Variables). Funciona con franjas
 * idénticas o distintas: se comparan por hora real, no por número de periodo.
 */
async function restriccionesDeOtrasJornadas(
  docenteIds: string[],
  academicYearId: Types.ObjectId,
  jornada: JornadaOperativaDocument,
  estructura: ReturnType<typeof construirEstructura>
): Promise<{ variables: VariableMotor[]; avisos: Aviso[]; respetadas: Set<string> }> {
  const vacio = { variables: [], avisos: [], respetadas: new Set<string>() };
  if (docenteIds.length === 0) return vacio;

  const jornadasOtras = (await JornadaOperativa.find({ _id: { $ne: jornada._id } })).filter((j) => jornadasSeTraslapan(jornada, j));
  if (jornadasOtras.length === 0) return vacio;

  const horarios = await Horario.find({
    academic_year_id: academicYearId,
    jornada_id: { $in: jornadasOtras.map((j) => j._id) },
    estado: { $in: ['PUBLICADO', 'BORRADOR'] },
  }).sort({ version: -1 });
  const sedes = new Map((await Campus.find({ _id: { $in: jornadasOtras.map((j) => j.sede_id) } }).select('nombre').lean()).map((c) => [String(c._id), c.nombre]));

  const avisos: Aviso[] = [];
  const respetadas = new Set<string>();
  const porDocente = new Map<string, Array<{ dia: number; inicio: string; fin: string }>>();
  const docentes = new Set(docenteIds);

  for (const otra of jornadasOtras) {
    const delasJornada = horarios.filter((h) => String(h.jornada_id) === String(otra._id));
    const elegido = delasJornada.find((h) => h.estado === 'PUBLICADO') ?? delasJornada[0];
    if (!elegido) continue;
    const donde = `${NOMBRES_JORNADA[otra.nombre] ?? otra.nombre} de ${sedes.get(String(otra.sede_id)) ?? 'otra sede'}`;
    if (elegido.huella_franjas !== huellaFranjas(otra)) {
      avisos.push({
        codigo: 'HORARIO_OTRA_JORNADA_DESFASADO',
        mensaje: `El horario de ${donde} se generó con otras franjas que las actuales de esa jornada, así que no se puede usar para evitar cruces de docentes. Genéralo de nuevo.`,
      });
      continue;
    }
    respetadas.add(String(otra._id));
    if (elegido.estado !== 'PUBLICADO') {
      avisos.push({
        codigo: 'HORARIO_OTRA_JORNADA_EN_BORRADOR',
        mensaje: `Los cruces de docentes con ${donde} se evitan con su borrador (versión ${elegido.version}), aún no publicado: si lo regeneras, vuelve a generar esta jornada.`,
      });
    }
    const periodos = construirEstructura(otra.dias_habiles, otra.franjas).periodos;
    const sesiones = elegido.sesiones.map((x) => ({ docente_ids: x.docente_ids.map(String).filter((d) => docentes.has(d)), dia: x.dia, periodo: x.periodo, duracion: x.duracion }));
    for (const o of ocupacionesDeSesiones(sesiones, periodos)) {
      porDocente.set(o.docente_id, [...(porDocente.get(o.docente_id) ?? []), { dia: o.dia, inicio: o.inicio, fin: o.fin }]);
    }
  }

  const variables: VariableMotor[] = [];
  for (const [docente, ocupaciones] of porDocente) {
    const celdas = celdasBloqueadasPorOcupaciones(estructura, ocupaciones);
    if (celdas.length === 0) continue;
    variables.push({
      id: `ext:${docente}`,
      tipo: 'DISPONIBILIDAD',
      severidad: 'DURA',
      peso: 10,
      alcance: { tipo: 'GLOBAL', grade_ids: [] },
      asignatura_ids: [],
      docente_ids: [docente],
      es_excepcion: false,
      parametros: { celdas },
    });
  }
  return { variables, avisos, respetadas };
}

/** Salones titulares (M10): grupos sin salón o con uno que ya no sirve (eliminado, en mantenimiento, inactivo o de otra sede). */
async function avisosDeSalones(
  grupos: Array<{ _id: Types.ObjectId; aula_id?: Types.ObjectId | null }>,
  sedeId: Types.ObjectId,
  virtual: boolean
): Promise<Aviso[]> {
  if (virtual || grupos.length === 0) return [];
  // Una sede que no registra salones (M10 es opcional) no tiene nada que avisar.
  if (!(await Espacio.exists({ sede_id: sedeId, tipo_espacio: 'AULA_REGULAR' })) && grupos.every((g) => !g.aula_id)) return [];
  const avisos: Aviso[] = [];
  const aulaIds = [...new Set(grupos.flatMap((g) => (g.aula_id ? [String(g.aula_id)] : [])))];
  const aulas = new Map((await Espacio.find({ _id: { $in: aulaIds } }).select('nombre estado sede_id').lean()).map((e) => [String(e._id), e]));

  const sinSalon: string[] = [];
  const salonNoSirve: string[] = [];
  for (const g of grupos) {
    if (!g.aula_id) {
      sinSalon.push(String(g._id));
      continue;
    }
    const aula = aulas.get(String(g.aula_id));
    if (!aula) salonNoSirve.push(`${g._id} (su salón fue eliminado)`);
    else if (aula.estado !== 'DISPONIBLE') salonNoSirve.push(`${g._id} (${aula.nombre} está ${aula.estado === 'EN_MANTENIMIENTO' ? 'en mantenimiento' : 'inactivo'})`);
    else if (String(aula.sede_id) !== String(sedeId)) salonNoSirve.push(`${g._id} (${aula.nombre} es de otra sede)`);
  }
  if (sinSalon.length > 0) {
    avisos.push({
      codigo: 'GRUPO_SIN_SALON',
      mensaje: `${sinSalon.length} grupo(s) no tienen salón titular: ${resumirLista(sinSalon)}. El horario no depende de eso, pero no tendrán aula asignada (Grupos o Espacios y aulas).`,
    });
  }
  if (salonNoSirve.length > 0) {
    avisos.push({
      codigo: 'SALON_DEL_GRUPO_NO_DISPONIBLE',
      mensaje: `Grupos cuyo salón titular ya no está disponible: ${resumirLista(salonNoSirve)}. Asígnales otro en Grupos.`,
    });
  }
  return avisos;
}

/**
 * Lee del sistema todo lo que el motor necesita para una jornada y un año: grupos activos de la jornada, su carga de
 * clase (M08), la estructura de tiempo de la jornada (M01), los espacios disponibles de su sede (M10) y las variables
 * activas. El motor recibe todo con ids string y no vuelve a tocar la base de datos.
 */
async function cargarContexto(academicYearId: string, jornadaId: string) {
  const { anio, jornada } = await exigirAnioYJornada(academicYearId, jornadaId, false);
  const estructura = construirEstructura(jornada.dias_habiles, jornada.franjas);

  // `$ne: 'CLOSED'`: un grupo anterior al campo `estado` cuenta como activo (ver utils/filtroEstado).
  const grupos = await Group.find({ academic_year_id: anio._id, jornada_id: jornada._id, estado: { $ne: 'CLOSED' } })
    .select('grade_id sede_id jornada_id aula_id')
    .lean();
  const gradoDeGrupo = new Map(grupos.map((g) => [String(g._id), String(g.grade_id)]));

  const [asignaciones, variablesDocs, institucion, plan] = await Promise.all([
    TeacherAssignment.find({
      academic_year_id: anio._id,
      tipo_asignacion: 'CLASE',
      estado: ESTADO_ACTIVO,
      group_id: { $in: grupos.map((g) => g._id) },
      subject_id: { $ne: null },
    }).lean(),
    VariableHorario.find({ academic_year_id: anio._id, jornada_id: jornada._id, estado: ESTADO_ACTIVO }).sort({ updatedAt: 1 }),
    Institution.findOne().select('modalidad').lean(),
    StudyPlan.findOne({ academic_year_id: anio._id }).select('grades').lean(),
  ]);
  const virtual = institucion?.modalidad === 'VIRTUAL';
  const espaciosDocs = virtual ? [] : await Espacio.find({ sede_id: jornada.sede_id, estado: { $nin: ESTADOS_ESPACIO_NO_USABLES } }).lean();

  const asignacionesBrutas: AsignacionMotor[] = asignaciones.map((a) => ({
    id: String(a._id),
    docente_id: String(a.docente_id),
    group_id: String(a.group_id),
    grade_id: gradoDeGrupo.get(String(a.group_id)) ?? '',
    subject_id: String(a.subject_id),
    horas_semanales: a.horas_semanales,
  }));

  // Las horas de una clase las manda el plan de estudios que rige en la sede y jornada del grupo (M06): la copia que guarda la
  // asignación (M08) puede haber quedado atrás. Un grupo sin plan aplicable se programa con las horas de su asignación.
  const planes = new Map(
    grupos.map((g) => [
      String(g._id),
      horasDelPlanDeGrupo(plan, { id: String(g._id), grade_id: String(g.grade_id), sede_id: String(g.sede_id), jornada_id: String(g.jornada_id) }),
    ])
  );
  const carga = conciliarCargaConPlan(asignacionesBrutas, gradoDeGrupo.keys(), planes);
  const asignacionesMotor = carga.asignaciones;

  const avisos: Aviso[] = [];
  if (!plan) {
    avisos.push({ codigo: 'SIN_PLAN_DE_ESTUDIOS', mensaje: 'Este año lectivo no tiene plan de estudios (M06): las horas se toman tal como están en Carga académica.' });
  }
  const etiquetaClase = (c: { subject_id: string; group_id: string }) => `${c.subject_id} de ${c.group_id}`;
  if (carga.grupos_sin_plan.length > 0 && plan) {
    avisos.push({
      codigo: 'GRUPO_SIN_PLAN',
      mensaje: `El plan de estudios no tiene asignaturas para ${resumirLista(carga.grupos_sin_plan)}: se usaron las horas de Carga académica. Configúralo en Plan de estudios.`,
    });
  }
  if (carga.horas_corregidas.length > 0) {
    avisos.push({
      codigo: 'HORAS_SEGUN_PLAN',
      mensaje: `${carga.horas_corregidas.length} clase(s) tenían en Carga académica horas distintas a las del plan de estudios de su grupo y se programaron con las del plan: ${resumirLista(
        carga.horas_corregidas.map((c) => `${etiquetaClase(c)} (${c.antes} h → ${c.ahora} h)`)
      )}. Guarda el plan del grado para actualizar Carga académica.`,
    });
  }
  if (carga.fuera_del_plan.length > 0) {
    avisos.push({
      codigo: 'ASIGNACION_FUERA_DEL_PLAN',
      mensaje: `Tienen docente, pero ya no están en el plan de estudios de su grupo y no se programaron: ${resumirLista(carga.fuera_del_plan.map(etiquetaClase))}. Retira esas asignaciones en Carga académica.`,
    });
  }
  if (carga.sin_docente.length > 0) {
    const horasSinDocente = carga.sin_docente.reduce((suma, c) => suma + c.horas, 0);
    avisos.push({
      codigo: 'ASIGNATURA_SIN_DOCENTE',
      mensaje: `Faltan docentes: ${carga.sin_docente.length} asignatura(s) del plan (${horasSinDocente} h semanales) no se pueden programar hasta asignarlas en Carga académica: ${resumirLista(
        carga.sin_docente.map((c) => `${etiquetaClase(c)} (${c.horas} h)`)
      )}.`,
    });
  }

  const docentesConCarga = [...new Set(asignacionesMotor.map((a) => a.docente_id))];
  const otrasJornadas = await restriccionesDeOtrasJornadas(docentesConCarga, anio._id, jornada, estructura);
  avisos.push(...(await avisosDeDocentes(docentesConCarga, anio._id, jornada, grupos.map((g) => g._id), otrasJornadas.respetadas)));
  avisos.push(...otrasJornadas.avisos);
  avisos.push(...(await avisosDeSalones(grupos, jornada.sede_id, virtual)));

  const planPorGrupo = new Map(
    [...planes].map(([id, horas]) => [
      id,
      {
        horas_plan: horas ? [...horas.values()].reduce((suma, h) => suma + h, 0) : null,
        horas_sin_docente: carga.sin_docente.filter((c) => c.group_id === id).reduce((suma, c) => suma + c.horas, 0),
      },
    ])
  );

  const asignaturasIds = new Set(asignacionesMotor.map((a) => a.subject_id));
  for (const c of [...carga.fuera_del_plan, ...carga.sin_docente]) asignaturasIds.add(c.subject_id);
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
      const nombreRegla = doc.descripcion || METADATOS_VARIABLE_HORARIO[v.tipo].etiqueta;
      if (usables.length === 0) {
        avisos.push({
          codigo: 'ESPACIO_NO_DISPONIBLE',
          mensaje: `La variable "${nombreRegla}" no tiene ningún espacio disponible para sus asignaturas (eliminado, en mantenimiento, inactivo o exclusivo de otra área); no se aplicó.`,
        });
        continue;
      }
      if (usables.length < v.parametros.espacio_ids.length) {
        avisos.push({
          codigo: 'ESPACIO_PARCIAL',
          mensaje: `La variable "${nombreRegla}" perdió ${v.parametros.espacio_ids.length - usables.length} de sus ${v.parametros.espacio_ids.length} espacios (eliminados, en mantenimiento o inactivos): quedan ${usables.length}.`,
        });
      }
      v.parametros = { espacio_ids: usables };
    }
    variables.push(v);
  }

  variables.push(...otrasJornadas.variables);

  const espaciosMotor = espaciosDocs.map((e) => ({ id: String(e._id), admite_grupos_simultaneos: e.admite_grupos_simultaneos }));
  const { sesiones, avisos: avisosExpansion } = expandirSesiones(asignacionesMotor, variables, estructura);
  avisos.push(...avisosExpansion, ...diagnosticarCapacidad(sesiones, variables, estructura, espaciosMotor));

  const entrada: EntradaMotor = { estructura, sesiones, variables, espacios: espaciosMotor };

  const catalogo = await construirCatalogo({
    grupos: gradoDeGrupo.keys(),
    docentes: [...sesiones.flatMap((s) => s.docente_ids), ...docentesConCarga],
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
    planPorGrupo,
  };
}

function aIncidencias(incidencias: readonly Incidencia[], humanizar: (t: string) => string) {
  return incidencias.map((i) => {
    // `ext:` = franja ocupada en otra jornada: no es una variable guardada, así que no se enlaza y el mensaje lo dice.
    const deOtraJornada = i.variable_id?.startsWith('ext:') ?? false;
    return {
      codigo: i.codigo,
      variable_id: deOtraJornada ? null : i.variable_id,
      dura: i.dura,
      magnitud: i.magnitud,
      claves_sesion: i.sesion_ids,
      mensaje: humanizar(deOtraJornada ? `Cruce con la otra jornada del docente. ${i.mensaje}` : i.mensaje),
    };
  });
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
    const n = await User.countDocuments({ _id: { $in: datos.docente_ids }, roles: 'DOCENTE' });
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
    grupos: ctx.catalogo.grupos.map((g) => ({
      ...g,
      horas: horasGrupo.get(g._id) ?? 0,
      horas_plan: ctx.planPorGrupo.get(g._id)?.horas_plan ?? null,
      horas_sin_docente: ctx.planPorGrupo.get(g._id)?.horas_sin_docente ?? 0,
    })),
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

/**
 * Los horarios publicados de una sede en un año (uno por jornada) con cuántos grupos, docentes y asignaturas trae cada uno, y un
 * color por asignatura que vale para todas las jornadas: así «Matemáticas» se ve igual en la mañana y en la tarde.
 */
export async function listarPublicadosDeSede(academicYearId: string, sedeId: string) {
  const jornadas = await JornadaOperativa.find({ sede_id: sedeId }).select('nombre hora_inicio hora_fin').sort({ hora_inicio: 1 }).lean();
  const horarios = await Horario.find({ academic_year_id: academicYearId, jornada_id: { $in: jornadas.map((j) => j._id) }, estado: 'PUBLICADO' })
    .select('jornada_id version nombre publicado_en sesiones.group_id sesiones.docente_ids sesiones.subject_id')
    .lean();

  const publicados = jornadas.flatMap((jornada) => {
    const horario = horarios.find((h) => String(h.jornada_id) === String(jornada._id));
    if (!horario) return [];
    const unicos = (ids: Array<Types.ObjectId | null | undefined>) => new Set(ids.filter(Boolean).map(String)).size;
    return [
      {
        _id: String(horario._id),
        version: horario.version,
        nombre: horario.nombre,
        publicado_en: horario.publicado_en ?? null,
        jornada: { _id: String(jornada._id), nombre: jornada.nombre, hora_inicio: jornada.hora_inicio, hora_fin: jornada.hora_fin },
        resumen: {
          grupos: unicos(horario.sesiones.map((s) => s.group_id)),
          docentes: unicos(horario.sesiones.flatMap((s) => s.docente_ids)),
          asignaturas: unicos(horario.sesiones.map((s) => s.subject_id)),
          sesiones: horario.sesiones.length,
        },
      },
    ];
  });
  const colores = asignarColoresAsignaturas(horarios.flatMap((h) => h.sesiones.flatMap((s) => (s.subject_id ? [String(s.subject_id)] : []))));
  return { publicados, colores: Object.fromEntries(colores) };
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
 * El detalle que ve coordinación, con una comprobación más: si la carga de HOY (plan de estudios, docentes) ya no produce las
 * mismas sesiones que tiene esta versión. Un horario generado antes de cambiar horas o docentes queda desfasado y no se
 * recalcula solo; aquí se dice, antes de que publicar lo rechace.
 */
export async function obtenerHorarioConRevision(id: string) {
  const detalle = await obtenerHorario(id);
  const { horario } = detalle;
  if (horario.estado !== 'BORRADOR' && horario.estado !== 'PUBLICADO') return { ...detalle, carga_cambio: null };
  try {
    const ctx = await cargarContexto(String(horario.academic_year_id), String(horario.jornada_id));
    const actuales = new Map(ctx.entrada.sesiones.map((x) => [x.id, x.duracion]));
    const guardadas = new Map(horario.sesiones.map((x) => [x.clave, x.duracion]));
    const sobran = [...guardadas.keys()].filter((c) => !actuales.has(c)).length;
    const faltan = [...actuales.keys()].filter((c) => !guardadas.has(c)).length;
    const cambiaron = [...guardadas].filter(([c, d]) => actuales.has(c) && actuales.get(c) !== d).length;
    return { ...detalle, carga_cambio: sobran + faltan + cambiaron > 0 ? { sobran, faltan, cambiaron } : null };
  } catch {
    // Sin año o jornada ya no hay con qué comparar: el detalle se entrega igual.
    return { ...detalle, carga_cambio: null };
  }
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

  // Un salón o laboratorio que se eliminó o salió de servicio desde que se generó no puede quedar en el horario publicado.
  for (const x of horario.sesiones) {
    if (x.clave in revision.espacios) x.espacio_id = revision.espacios[x.clave] ? new Types.ObjectId(revision.espacios[x.clave]!) : null;
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
