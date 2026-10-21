import { Types } from 'mongoose';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { ROLES } from '../constants/roles';
import Enrollment from '../models/enrollment.model';
import EvaluacionPromocion from '../models/evaluacionPromocionEstudiante.model';
import Institution from '../models/institution.model';
import NotaHomologada from '../models/notaHomologada.model';
import Subject from '../models/subject.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import User, { UserDocument } from '../models/user.model';
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
import { calcularEstadisticas } from './attendanceStats.service';
import { cargarAnio } from './configuracionRecuperaciones.service';
import { construirEntradasDelGrupo } from './promocionContexto.service';
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

/** Las asignaturas con docente (CLASE activa) del grupo, con su nombre, en orden alfabético. */
async function asignaturasDelGrupo(anioId: Types.ObjectId, grupoId: Types.ObjectId) {
  const asignaciones = await TeacherAssignment.find({ academic_year_id: anioId, group_id: grupoId, tipo_asignacion: 'CLASE', estado: ESTADO_ACTIVO }).select('_id subject_id').lean();
  const subjects = await Subject.find({ _id: { $in: asignaciones.map((a) => a.subject_id) } }).select('nombre abreviatura').lean();
  const asignaturas: AsignaturaSabana[] = subjects
    .map((s) => ({ subject_id: String(s._id), nombre: s.nombre, abreviatura: s.abreviatura }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return { asignaciones, asignaturas };
}

/** Totales de fallas por estudiante en el grupo (todas las fallas, justificadas o no). */
async function fallasPorEstudiante(anioId: string, grupoId: string, periodo?: number): Promise<Map<string, number>> {
  const { filas } = await calcularEstadisticas({ academic_year_id: anioId, agrupar_por: 'estudiante', group_id: grupoId, periodo_numero: periodo }, null);
  return new Map(filas.map((f) => [f.clave, f.fallas]));
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

  for (const grupo of grupos) {
    const matriculas = await Enrollment.find({ group_id: grupo._id, academic_year_id: anio._id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } }).select('student_id').lean();
    const estudiantesIds = matriculas.map((m) => String(m.student_id));
    const [usuarios, { asignaciones, asignaturas }, fallas] = await Promise.all([
      User.find({ _id: { $in: estudiantesIds } }).select('nombre apellido numero_documento').lean(),
      asignaturasDelGrupo(anio._id, grupo._id),
      fallasPorEstudiante(filtros.academic_year_id, String(grupo._id), periodo),
    ]);
    const usuarioPor = new Map(usuarios.map((u) => [String(u._id), u]));
    const asignacionDe = new Map(asignaciones.map((a) => [String(a.subject_id), a._id]));

    const estudiantes: EstudianteSabanaEntrada[] = [];

    if (periodo === undefined) {
      const entradas = await construirEntradasDelGrupo(anio, grupo, 'CIERRE');
      const cierres = new Map((await EvaluacionPromocion.find({ academic_year_id: anio._id, group_id: grupo._id, vigente: true }).select('student_id resultado').lean()).map((c) => [String(c.student_id), c.resultado]));
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
        const oficial = cierres.get(e.student_id);
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
          fallas: fallas.get(e.student_id) ?? 0,
          promocion: { codigo: resultadoPromocion, texto: ETIQUETA_PROMOCION_SABANA[resultadoPromocion] ?? resultadoPromocion, oficial: Boolean(oficial) },
        });
      }
    } else {
      const ctx = await cargarContextoNotas(anio, asignaciones.map((a) => a._id));
      for (const id of estudiantesIds) {
        const u = usuarioPor.get(id);
        const notas: Record<string, NotaSabana> = {};
        for (const a of asignaturas) {
          const entrada = ctx.notas.get(clave(asignacionDe.get(a.subject_id), id));
          const efectiva = entrada?.efectivas.get(periodo) ?? null;
          notas[a.subject_id] = {
            nota: efectiva,
            exenta: entrada?.exentos.has(periodo) ?? false,
            recuperada: efectiva !== null && entrada?.cerradas.get(periodo) !== undefined && entrada?.cerradas.get(periodo) !== efectiva,
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
          fallas: fallas.get(id) ?? 0,
          promocion: null,
        });
      }
    }

    const sabana = armarSabana({ asignaturas, estudiantes, notaAprobatoria: escala.nota_aprobatoria, decimales: escala.precision_decimales, mostrarPuesto: config.mostrar_puesto });
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
    leyenda,
    nota_aprobatoria: escala.nota_aprobatoria,
    mostrar_puesto: config.mostrar_puesto,
    incluye_promocion: esCierreDelAnio,
    grupos: resultado,
  };
}
