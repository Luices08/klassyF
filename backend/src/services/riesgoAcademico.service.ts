import { NivelRiesgo } from '../constants/comision';
import { ROLES } from '../constants/roles';
import ExpedienteInclusion from '../models/expedienteInclusion.model';
import Group from '../models/group.model';
import Subject from '../models/subject.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { alertasDeReprobacionMasiva, ConteoDeReprobacion, nivelDeRiesgo } from '../utils/comision';
import { escalaEfectiva } from '../utils/escalaEvaluacion';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { registrarEvento } from './audit.service';
import { cargarAnio } from './configuracionRecuperaciones.service';
import { datosDeConfiguracion, obtenerConfiguracion } from './configuracionComision.service';
import { armarFila, cargarContextoPlanilla } from './notas.service';
import { asistenciaPorEstudiante, porcentajeDe } from './promocionContexto.service';
import { idsDeGradosSinReprobacion } from './nivelesSinReprobacion.service';

export interface FiltrosTablero {
  academic_year_id: string;
  periodo_numero: number;
  group_id?: string;
  grade_id?: string;
  sede_id?: string;
}

export interface EstudianteEnRiesgo {
  student_id: string;
  nombre: string;
  apellido: string;
  numero_documento: string;
  grupo: string;
  grupo_id: string;
  perdidas: string[];
  asignaturas_sin_nota: number;
  inasistencia_pct: number;
  nivel: NivelRiesgo;
  motivos: string[];
  /** Solo el hecho de tener ajustes razonables vigentes: la categoría y la modalidad no salen de M16. */
  tiene_piar: boolean;
}

export interface TableroDeRiesgo {
  periodo_numero: number;
  /** Las notas de planillas abiertas son una proyección; las cerradas, definitivas. */
  hay_notas_provisionales: boolean;
  umbrales: { semaforo: ReturnType<typeof datosDeConfiguracion>['semaforo']; reprobacion_masiva: ReturnType<typeof datosDeConfiguracion>['reprobacion_masiva'] };
  resumen: Record<NivelRiesgo, number> & { total: number; con_piar: number };
  estudiantes: EstudianteEnRiesgo[];
  alertas_masivas: { asignaturas: ReturnType<typeof alertasDeReprobacionMasiva>; docentes: ReturnType<typeof alertasDeReprobacionMasiva> };
}

const ORDEN_NIVEL: Record<NivelRiesgo, number> = { ROJO: 0, NARANJA: 1, AMARILLO: 2, VERDE: 3 };

/**
 * El tablero de rectoría y coordinación antes de convocar a la comisión (M20): semáforo por estudiante, quiénes tienen ajustes razonables y las
 * asignaturas o docentes con una tasa de reprobación anómala. Lee las planillas del periodo (lo cerrado como definitivo y lo abierto como
 * proyección) y la asistencia acumulada del año. Todos los umbrales son de la configuración del colegio. No decide nada: ayuda a convocar a tiempo.
 */
export async function tableroDeRiesgo(filtros: FiltrosTablero, usuario: UserDocument, ip?: string | null): Promise<TableroDeRiesgo> {
  if (usuario.rol !== ROLES.ADMIN && usuario.rol !== ROLES.COORDINADOR) throw new ApiError(403, 'Solo rectoría y coordinación consultan el tablero de riesgo.');
  const tablero = await calcularTableroDeRiesgo(filtros);
  await registrarEvento({ usuario_id: usuario._id, accion: 'COMISION_TABLERO_CONSULTADO', entidad: 'AcademicYear', entidad_id: filtros.academic_year_id, detalle: `Periodo ${filtros.periodo_numero}, ${tablero.estudiantes.length} estudiantes`, ip });
  return tablero;
}

/**
 * El cálculo del tablero sin la comprobación de rol ni la auditoría: quien llama decide quién puede verlo. Lo usan el tablero de la comisión y el
 * dashboard de coordinación, que lo refresca seguido y no debe llenar la bitácora con una línea por cada carga.
 */
export async function calcularTableroDeRiesgo(filtros: FiltrosTablero): Promise<TableroDeRiesgo> {
  const anio = await cargarAnio(filtros.academic_year_id);
  if (!anio.periodos.some((p) => p.numero === filtros.periodo_numero)) throw new ApiError(400, `El año ${anio.year} no tiene periodo ${filtros.periodo_numero}.`);
  const config = datosDeConfiguracion(await obtenerConfiguracion());
  const aprobatoria = escalaEfectiva(anio.escala_evaluacion).nota_aprobatoria;

  // Preescolar no reprueba (Decreto 2247/1997): sus grupos no entran al semáforo de riesgo de perder el año.
  const gradosSinReprobacion = await idsDeGradosSinReprobacion();
  const grupos = await Group.find({
    academic_year_id: anio._id,
    estado: { $ne: 'CLOSED' },
    ...(filtros.group_id ? { _id: filtros.group_id } : {}),
    grade_id: filtros.grade_id ? (gradosSinReprobacion.includes(String(filtros.grade_id)) ? { $in: [] } : filtros.grade_id) : { $nin: gradosSinReprobacion },
    ...(filtros.sede_id ? { sede_id: filtros.sede_id } : {}),
  }).select('nomenclatura');
  const asignaciones = await TeacherAssignment.find({ academic_year_id: anio._id, group_id: { $in: grupos.map((g) => g._id) }, tipo_asignacion: 'CLASE', estado: ESTADO_ACTIVO });
  const asignaturas = await Subject.find({ _id: { $in: asignaciones.map((a) => a.subject_id) } }).select('nombre');
  const nombreAsignatura = new Map(asignaturas.map((s) => [String(s._id), s.nombre]));
  const nombreGrupo = new Map(grupos.map((g) => [String(g._id), g.nomenclatura]));

  interface Acumulado {
    nombre: string;
    apellido: string;
    documento: string;
    grupo_id: string;
    perdidas: string[];
    sin_nota: number;
  }
  const porEstudiante = new Map<string, Acumulado>();
  const porAsignacion: ConteoDeReprobacion[] = [];
  const porDocente = new Map<string, ConteoDeReprobacion>();
  let provisional = false;

  for (const asignacion of asignaciones) {
    const ctx = await cargarContextoPlanilla(asignacion, filtros.periodo_numero);
    const asignatura = nombreAsignatura.get(String(asignacion.subject_id)) ?? 'Asignatura';
    const conteo: ConteoDeReprobacion = { clave: String(asignacion._id), nombre: `${asignatura} · ${nombreGrupo.get(String(asignacion.group_id)) ?? ''}`, evaluados: 0, reprobados: 0 };
    for (const est of ctx.estudiantes) {
      const fila = armarFila(ctx, est);
      const acumulado = porEstudiante.get(est._id) ?? { nombre: est.nombre, apellido: est.apellido, documento: est.numero_documento, grupo_id: String(asignacion.group_id), perdidas: [], sin_nota: 0 };
      if (fila.nota_asignatura === null) acumulado.sin_nota += 1;
      else {
        conteo.evaluados += 1;
        if (fila.parcial || !['CERRADO', 'DEFINITIVO'].includes(fila.estado)) provisional = true;
        if (fila.nota_asignatura < aprobatoria) {
          conteo.reprobados += 1;
          acumulado.perdidas.push(asignatura);
        }
      }
      porEstudiante.set(est._id, acumulado);
    }
    porAsignacion.push(conteo);
    const docente = porDocente.get(String(asignacion.docente_id)) ?? { clave: String(asignacion.docente_id), nombre: '', evaluados: 0, reprobados: 0 };
    docente.evaluados += conteo.evaluados;
    docente.reprobados += conteo.reprobados;
    porDocente.set(docente.clave, docente);
  }

  // Asistencia acumulada del año por grupo, y ajustes razonables vigentes (solo el hecho de tenerlos).
  const asistencia = new Map<string, Awaited<ReturnType<typeof asistenciaPorEstudiante>>>();
  for (const g of grupos) asistencia.set(String(g._id), await asistenciaPorEstudiante(String(anio._id), String(g._id)));
  const ids = [...porEstudiante.keys()];
  const conPiar = new Set((await ExpedienteInclusion.find({ academic_year_id: anio._id, student_id: { $in: ids }, tipo: 'PIAR', estado: 'ACTIVO' }).select('student_id').lean()).map((e) => String(e.student_id)));

  const estudiantes: EstudianteEnRiesgo[] = [...porEstudiante.entries()].map(([id, a]) => {
    const t = asistencia.get(a.grupo_id)?.get(id);
    const inasistencia = t ? (config.semaforo.faltas === 'TODAS' ? t.porcentaje_ausentismo : porcentajeDe(t.fallas_injustificadas, t.total_registros)) : 0;
    const riesgo = nivelDeRiesgo(a.perdidas.length, inasistencia, config.semaforo);
    return {
      student_id: id,
      nombre: a.nombre,
      apellido: a.apellido,
      numero_documento: a.documento,
      grupo: nombreGrupo.get(a.grupo_id) ?? '',
      grupo_id: a.grupo_id,
      perdidas: a.perdidas,
      asignaturas_sin_nota: a.sin_nota,
      inasistencia_pct: inasistencia,
      nivel: riesgo.nivel,
      motivos: riesgo.motivos,
      tiene_piar: conPiar.has(id),
    };
  });
  estudiantes.sort((x, y) => ORDEN_NIVEL[x.nivel] - ORDEN_NIVEL[y.nivel] || y.perdidas.length - x.perdidas.length || x.apellido.localeCompare(y.apellido, 'es'));

  const docentes = await User.find({ _id: { $in: [...porDocente.keys()] } }).select('nombre apellido');
  const nombreDocente = new Map(docentes.map((d) => [String(d._id), `${d.nombre} ${d.apellido}`]));
  const resumen = { VERDE: 0, AMARILLO: 0, NARANJA: 0, ROJO: 0, total: estudiantes.length, con_piar: estudiantes.filter((e) => e.tiene_piar).length };
  for (const e of estudiantes) resumen[e.nivel] += 1;

  return {
    periodo_numero: filtros.periodo_numero,
    hay_notas_provisionales: provisional,
    umbrales: { semaforo: config.semaforo, reprobacion_masiva: config.reprobacion_masiva },
    resumen,
    estudiantes,
    alertas_masivas: {
      asignaturas: alertasDeReprobacionMasiva(porAsignacion, config.reprobacion_masiva),
      docentes: alertasDeReprobacionMasiva([...porDocente.values()].map((d) => ({ ...d, nombre: nombreDocente.get(d.clave) ?? 'Docente' })), config.reprobacion_masiva),
    },
  };
}
