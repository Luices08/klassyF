import { Types } from 'mongoose';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { ROLES } from '../constants/roles';
import { NivelValoracion } from '../constants/valoracionDescriptiva';
import Enrollment from '../models/enrollment.model';
import EvaluacionPromocion from '../models/evaluacionPromocionEstudiante.model';
import Institution from '../models/institution.model';
import NotaHomologada from '../models/notaHomologada.model';
import Subject from '../models/subject.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import User, { UserDocument } from '../models/user.model';
import ValoracionDescriptiva from '../models/valoracionDescriptiva.model';
import ApiError from '../utils/ApiError';
import { calcularPromedioGeneral } from '../utils/calculoNotas';
import { escalaEfectiva } from '../utils/escalaEvaluacion';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { evaluarPromocion } from '../utils/promocion';
import {
  AsignaturaSabana,
  ETIQUETA_PROMOCION_SABANA,
  EstudianteSabanaEntrada,
  NotaSabana,
  Sabana,
  armarSabana,
} from '../utils/sabanaCalificaciones';
import { gruposDelAlcance } from './alcanceReportes.service';
import { registrarEvento } from './audit.service';
import { leerConfiguracionBoletin } from './boletinConfig.service';
import { asistenciaDeGrupos } from './attendanceStats.service';
import { cargarAnio } from './configuracionRecuperaciones.service';
import { idsDeGradosSinReprobacion } from './nivelesSinReprobacion.service';
import { construirEntradasDeGrupos } from './promocionContexto.service';
import { datosDePolitica, obtenerPolitica } from './politicaPromocion.service';
import { cargarContextoNotas, clave } from './recuperacion.service';

export interface FiltrosSabana {
  academic_year_id: string;
  sede_id?: string;
  jornada_id?: string;
  grade_id?: string;
  group_id?: string;
  /** Sin periodo = el cierre del año; con periodo = las notas de ese periodo. */
  periodo_numero?: number;
}

export type EstadoDatosSabana = 'PERIODO' | 'PRELIMINAR' | 'DEFINITIVO';

export interface SabanaDeGrupo extends Sabana {
  grupo: { _id: string; etiqueta: string; grado: string; nomenclatura: string; sede: string; jornada: string };
}

export interface ReporteSabana {
  generado_en: Date;
  institucion: string;
  anio: number;
  corte: string;
  /** PERIODO: notas de un periodo; PRELIMINAR: el año aún sin cierre de promoción de todos; DEFINITIVO: todos con cierre vigente. */
  estado_datos: EstadoDatosSabana;
  /** Texto para el encabezado: dice en qué punto está el archivo. */
  leyenda: string;
  nota_aprobatoria: number;
  mostrar_puesto: boolean;
  /** Las columnas de promoción solo existen en el cierre del año. */
  incluye_promocion: boolean;
  grupos: SabanaDeGrupo[];
}

/**
 * La valoración descriptiva de cada estudiante en cada asignatura de los grupos de Preescolar: «asignatura|estudiante» → su nivel. Con periodo, el de ese
 * periodo; sin él, el del último periodo que ya tiene valoración (el cierre del año). Una sola lectura para todos los grupos descriptivos del alcance.
 */
async function valoracionesDeGrupos(anioId: Types.ObjectId, asignaciones: Array<{ _id: Types.ObjectId; subject_id: Types.ObjectId }>, periodo: number | undefined): Promise<Map<string, NivelValoracion>> {
  const resultado = new Map<string, NivelValoracion>();
  if (asignaciones.length === 0) return resultado;
  const asignaturaDe = new Map(asignaciones.map((a) => [String(a._id), String(a.subject_id)]));
  const valoraciones = await ValoracionDescriptiva.find({
    academic_year_id: anioId,
    teacher_assignment_id: { $in: asignaciones.map((a) => a._id) },
    ...(periodo === undefined ? {} : { periodo_numero: periodo }),
  })
    .select('teacher_assignment_id student_id periodo_numero nivel')
    .lean();
  const periodoPor = new Map<string, number>();
  for (const v of valoraciones) {
    const llave = `${asignaturaDe.get(String(v.teacher_assignment_id))}|${String(v.student_id)}`;
    if ((periodoPor.get(llave) ?? 0) >= v.periodo_numero) continue;
    periodoPor.set(llave, v.periodo_numero);
    resultado.set(llave, v.nivel);
  }
  return resultado;
}

/** Los periodos en que cada estudiante está exento de cada asignatura por traslado (M04): «estudiante|asignatura» → periodos. Una exenta no es un cero ni una perdida. */
export async function exentosDelAnio(anioId: Types.ObjectId | string): Promise<Map<string, Set<number>>> {
  const exentosPor = new Map<string, Set<number>>();
  const exentas = await NotaHomologada.find({ academic_year_id: anioId, estado: 'EXENTA_POR_TRASLADO' }).select('student_id subject_id periodo_numero').lean();
  for (const e of exentas) {
    const k = `${String(e.student_id)}|${String(e.subject_id)}`;
    exentosPor.set(k, (exentosPor.get(k) ?? new Set()).add(e.periodo_numero));
  }
  return exentosPor;
}

const PUEDEN_CONSULTAR: string[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];

function exigirAcceso(usuario: UserDocument): void {
  if (!PUEDEN_CONSULTAR.includes(usuario.rol)) throw new ApiError(403, 'Solo administración, coordinación y secretaría descargan la sábana de calificaciones.');
}

/** Agrupa una lista por la llave de cada elemento (id de grupo, de estudiante…) para no filtrarla entera por cada grupo. */
export function agruparPor<T>(lista: readonly T[], llave: (x: T) => string): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const x of lista) {
    const k = llave(x);
    const actual = mapa.get(k);
    if (actual) actual.push(x);
    else mapa.set(k, [x]);
  }
  return mapa;
}

export async function generarSabana(filtros: FiltrosSabana, usuario: UserDocument, ip?: string | null): Promise<ReporteSabana> {
  exigirAcceso(usuario);
  const anio = await cargarAnio(filtros.academic_year_id);
  if (filtros.periodo_numero && !anio.periodos.some((p) => p.numero === filtros.periodo_numero)) {
    throw new ApiError(400, `El año lectivo ${anio.year} no tiene periodo ${filtros.periodo_numero}.`);
  }

  // Los grupos del alcance (sede → jornada → grado → grupo; Secretaría solo en sus sedes) los resuelve el helper común de los reportes de cierre.
  const grupos = await gruposDelAlcance(anio._id, filtros, usuario);
  const [institucion, config] = await Promise.all([Institution.findOne().select('nombre').lean(), leerConfiguracionBoletin()]);

  const escala = escalaEfectiva(anio.escala_evaluacion);
  const periodo = filtros.periodo_numero;
  const esCierreDelAnio = periodo === undefined;

  // Solo el cierre del año necesita la política (para proyectar la decisión de quien aún no tiene cierre) y los exentos por traslado.
  const politica = esCierreDelAnio ? datosDePolitica(await obtenerPolitica(filtros.academic_year_id)) : null;
  const exentosPor = esCierreDelAnio ? await exentosDelAnio(anio._id) : new Map<string, Set<number>>();

  let estudiantesTotal = 0;
  let conCierre = 0;
  const resultado: SabanaDeGrupo[] = [];

  // Todo lo que antes se consultaba grupo por grupo se lee una vez para el alcance completo y se reparte con mapas por id: el bucle de abajo
  // solo calcula en memoria. Con decenas de grupos eso pasa de cientos de consultas a unas pocas.
  const grupoIds = grupos.map((g) => g._id);
  const [matriculas, asignacionesTodas, asistencia, cierresTodos] = await Promise.all([
    Enrollment.find({ group_id: { $in: grupoIds }, academic_year_id: anio._id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } }).select('student_id group_id').lean(),
    TeacherAssignment.find({ academic_year_id: anio._id, group_id: { $in: grupoIds }, tipo_asignacion: 'CLASE', estado: ESTADO_ACTIVO }).select('_id subject_id group_id').lean(),
    // Las fallas de la sábana son todas las del estudiante, justificadas o no: es la suma de su asistencia, la misma que usa el motor de promoción.
    asistenciaDeGrupos(filtros.academic_year_id, grupoIds.map(String), periodo),
    esCierreDelAnio ? EvaluacionPromocion.find({ academic_year_id: anio._id, group_id: { $in: grupoIds }, vigente: true }).select('student_id group_id resultado').lean() : Promise.resolve([]),
  ]);
  const [usuarios, subjects] = await Promise.all([
    User.find({ _id: { $in: matriculas.map((m) => m.student_id) } }).select('nombre apellido numero_documento').lean(),
    Subject.find({ _id: { $in: asignacionesTodas.map((a) => a.subject_id) } }).select('nombre abreviatura').lean(),
  ]);
  const usuarioPor = new Map(usuarios.map((u) => [String(u._id), u]));
  const subjectPor = new Map(subjects.map((s) => [String(s._id), s]));
  const matriculasPorGrupo = agruparPor(matriculas, (m) => String(m.group_id));
  const asignacionesPorGrupo = agruparPor(asignacionesTodas, (a) => String(a.group_id));
  const cierrePor = new Map(cierresTodos.map((c) => [`${String(c.group_id)}|${String(c.student_id)}`, c.resultado]));
  const entradasPorGrupo = esCierreDelAnio ? await construirEntradasDeGrupos(anio, grupos, 'CIERRE', { asistencia }) : null;
  const ctxPeriodo = esCierreDelAnio ? null : await cargarContextoNotas(anio, asignacionesTodas.map((a) => a._id));

  // Preescolar no tiene notas (Decreto 2247/1997): sus grupos se muestran con la valoración descriptiva en vez de celdas vacías.
  const gradosSinReprobacion = new Set(await idsDeGradosSinReprobacion());
  const gruposDescriptivos = new Set(grupos.filter((g) => gradosSinReprobacion.has(String(g.grade_id))).map((g) => String(g._id)));
  const valoracionPor = await valoracionesDeGrupos(
    anio._id,
    asignacionesTodas.filter((a) => gruposDescriptivos.has(String(a.group_id))).map((a) => ({ _id: a._id, subject_id: a.subject_id as Types.ObjectId })),
    periodo
  );

  for (const grupo of grupos) {
    const grupoId = String(grupo._id);
    const estudiantesIds = (matriculasPorGrupo.get(grupoId) ?? []).map((m) => String(m.student_id));
    const asignaciones = asignacionesPorGrupo.get(grupoId) ?? [];
    // Las asignaturas con docente del grupo, sin repetir, en orden alfabético.
    const asignaturas: AsignaturaSabana[] = [...new Set(asignaciones.map((a) => String(a.subject_id)))]
      .map((id) => subjectPor.get(id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .map((s) => ({ subject_id: String(s._id), nombre: s.nombre, abreviatura: s.abreviatura }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const asignacionDe = new Map(asignaciones.map((a) => [String(a.subject_id), a._id]));
    const fallasDe = (estudianteId: string): number => asistencia.get(grupoId)?.get(estudianteId)?.global.fallas ?? 0;

    const estudiantes: EstudianteSabanaEntrada[] = [];

    if (entradasPorGrupo) {
      const entradas = entradasPorGrupo.get(grupoId) ?? [];
      for (const e of entradas) {
        const u = usuarioPor.get(e.student_id);
        const notas: Record<string, NotaSabana> = {};
        for (const a of e.entrada.asignaturas) {
          const exentos = exentosPor.get(`${e.student_id}|${a.subject_id}`);
          notas[a.subject_id] = {
            nota: a.nota_final,
            exenta: Boolean(exentos) && anio.periodos.every((p) => exentos!.has(p.numero)),
            recuperada: a.nota_final !== a.nota_antes,
          };
        }
        const oficial = cierrePor.get(`${grupoId}|${e.student_id}`);
        const resultadoPromocion = oficial ?? evaluarPromocion(e.entrada, politica!, 'CIERRE').resultado;
        estudiantesTotal += 1;
        if (oficial) conCierre += 1;
        estudiantes.push({
          student_id: e.student_id,
          numero_documento: u?.numero_documento ?? '',
          nombres: u?.nombre ?? '',
          apellidos: u?.apellido ?? '',
          notas,
          promedio: calcularPromedioGeneral(e.entrada.areas.map((a) => a.nota_final)),
          fallas: fallasDe(e.student_id),
          promocion: { codigo: resultadoPromocion, texto: ETIQUETA_PROMOCION_SABANA[resultadoPromocion] ?? resultadoPromocion, oficial: Boolean(oficial) },
        });
      }
    } else {
      const ctx = ctxPeriodo!;
      const numeroPeriodo = periodo as number;
      for (const id of estudiantesIds) {
        const u = usuarioPor.get(id);
        const notas: Record<string, NotaSabana> = {};
        for (const a of asignaturas) {
          const entrada = ctx.notas.get(clave(asignacionDe.get(a.subject_id), id));
          const efectiva = entrada?.efectivas.get(numeroPeriodo) ?? null;
          notas[a.subject_id] = {
            nota: efectiva,
            exenta: entrada?.exentos.has(numeroPeriodo) ?? false,
            recuperada: efectiva !== null && entrada?.cerradas.get(numeroPeriodo) !== undefined && entrada?.cerradas.get(numeroPeriodo) !== efectiva,
          };
        }
        estudiantes.push({
          student_id: id,
          numero_documento: u?.numero_documento ?? '',
          nombres: u?.nombre ?? '',
          apellidos: u?.apellido ?? '',
          notas,
          // Promedio simple de las asignaturas cursadas: en un periodo no hay áreas ponderadas que consolidar.
          promedio: calcularPromedioGeneral(Object.values(notas).filter((n) => !n.exenta).map((n) => n.nota)),
          fallas: fallasDe(id),
          promocion: null,
        });
      }
    }

    const descriptiva = gruposDescriptivos.has(grupoId);
    if (descriptiva) {
      for (const e of estudiantes) {
        e.promedio = null;
        e.notas = Object.fromEntries(
          asignaturas.map((a) => [a.subject_id, { nota: null, exenta: false, recuperada: false, valoracion: valoracionPor.get(`${a.subject_id}|${e.student_id}`) ?? null } satisfies NotaSabana])
        );
      }
    }

    const sabana = armarSabana({ asignaturas, estudiantes, notaAprobatoria: escala.nota_aprobatoria, decimales: escala.precision_decimales, mostrarPuesto: config.mostrar_puesto, descriptiva });
    resultado.push({
      grupo: { _id: String(grupo._id), etiqueta: grupo.etiqueta, grado: grupo.grado, nomenclatura: grupo.nomenclatura, sede: grupo.sede, jornada: grupo.jornada },
      ...sabana,
    });
  }

  const estado: EstadoDatosSabana = periodo !== undefined ? 'PERIODO' : estudiantesTotal > 0 && conCierre === estudiantesTotal ? 'DEFINITIVO' : 'PRELIMINAR';
  const leyenda =
    estado === 'PERIODO'
      ? `Notas del periodo ${periodo} (las que los docentes ya cerraron al ${new Date().toLocaleDateString('es-CO')}).`
      : estado === 'DEFINITIVO'
        ? 'Definitiva: todos los estudiantes tienen el cierre de promoción del año.'
        : 'Preliminar: aún hay estudiantes sin cierre de promoción; la decisión mostrada es una proyección y las notas incluyen las recuperaciones registradas hasta hoy.';
  const notaPreescolar = gruposDescriptivos.size > 0 ? ` Preescolar no lleva notas ni promedios (Decreto 2247 de 1997): sus grupos muestran el nivel de la valoración descriptiva${periodo === undefined ? ' del último periodo valorado' : ''}.` : '';

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'REPORTE_CIERRE_GENERADO',
    entidad: 'AcademicYear',
    entidad_id: anio._id,
    detalle: `Sábana de calificaciones (${periodo === undefined ? 'cierre del año' : `periodo ${periodo}`}): ${resultado.length} grupo(s)`,
    ip,
  });

  return {
    generado_en: new Date(),
    institucion: institucion?.nombre ?? '',
    anio: anio.year,
    corte: periodo === undefined ? 'Cierre del año' : `Periodo ${periodo}`,
    estado_datos: estado,
    leyenda: `${leyenda}${notaPreescolar}`,
    nota_aprobatoria: escala.nota_aprobatoria,
    mostrar_puesto: config.mostrar_puesto,
    incluye_promocion: esCierreDelAnio,
    grupos: resultado,
  };
}
