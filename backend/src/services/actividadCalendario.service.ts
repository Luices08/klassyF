import { Types } from 'mongoose';
import { TipoActividad } from '../constants/actividades';
import Activity from '../models/activity.model';
import Group from '../models/group.model';
import TeacherAssignment, { TeacherAssignmentDocument } from '../models/teacherAssignment.model';
import ApiError from '../utils/ApiError';
import {
  ActividadDelGrupo,
  AlertaCalendario,
  diaCalendarioColombia,
  evaluarCalendarioActividad,
} from '../utils/actividades';
import { finDelDia, inicioDelDia, periodosEfectivos } from '../utils/calendarioAcademico';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { cargarContextoFechas } from './attendance.service';
import { obtenerConfiguracionActividades } from './configuracionActividades.service';

export interface ConsultaCalendario {
  periodo_numero: number;
  fecha_entrega: Date;
  tipo: TipoActividad;
  /** La actividad que se está editando: no cuenta como carga de sí misma. */
  excluir_id?: string | Types.ObjectId;
  exigir_futuro: boolean;
}

export interface RevisionCalendario {
  alertas: AlertaCalendario[];
  /** Lo que el grupo ya tiene para ese día, de cualquier docente. */
  carga_del_dia: Array<Pick<ActividadDelGrupo, 'titulo' | 'tipo' | 'asignatura'>>;
  limites: { max_evaluaciones_por_dia: number; max_entregas_por_dia: number };
}

/**
 * Prevención de sobrecarga: cruza la fecha de entrega con el calendario del año lectivo (M05: periodo de la sede,
 * recesos, vacaciones, recuperaciones, días hábiles de la jornada) y con lo que ya tiene el grupo ese día. M25 aún no
 * existe; cuando exista, este es el único punto que debe leerlo.
 */
export async function revisarCalendario(
  asignacion: TeacherAssignmentDocument,
  consulta: ConsultaCalendario
): Promise<RevisionCalendario> {
  const grupo = await Group.findById(asignacion.group_id);
  if (!grupo) throw new ApiError(404, 'Grupo de la asignación académica no encontrado.');

  const [contexto, configuracion] = await Promise.all([cargarContextoFechas(grupo), obtenerConfiguracionActividades()]);

  const periodo = contexto.anio.periodos.find((p) => p.numero === consulta.periodo_numero);
  if (!periodo) throw new ApiError(400, `El año lectivo ${contexto.anio.year} no tiene periodo ${consulta.periodo_numero}.`);
  const calendarioSede = contexto.anio.calendarios_sede.find((c) => String(c.sede_id) === String(grupo.sede_id));
  const efectivo = periodosEfectivos(contexto.anio.periodos, calendarioSede).find((p) => p.numero === consulta.periodo_numero) ?? periodo;

  const dia = diaCalendarioColombia(consulta.fecha_entrega);
  const clasesDelGrupo = await TeacherAssignment.find({
    group_id: grupo._id,
    academic_year_id: asignacion.academic_year_id,
    tipo_asignacion: 'CLASE',
    estado: ESTADO_ACTIVO,
  })
    .populate<{ subject_id: { nombre: string } | null }>('subject_id', 'nombre')
    .lean();
  const asignaturaDe = new Map(clasesDelGrupo.map((c) => [String(c._id), c.subject_id?.nombre ?? 'Asignatura']));

  const actividadesDelDia = await Activity.find({
    teacher_assignment_id: { $in: clasesDelGrupo.map((c) => c._id) },
    fecha_entrega: { $gte: inicioDelDia(dia), $lte: finDelDia(dia) },
    ...(consulta.excluir_id ? { _id: { $ne: consulta.excluir_id } } : {}),
  }).lean();
  const delGrupo: ActividadDelGrupo[] = actividadesDelDia.map((a) => ({
    titulo: a.titulo,
    tipo: a.tipo ?? 'TAREA',
    asignatura: asignaturaDe.get(String(a.teacher_assignment_id)) ?? 'Asignatura',
    fecha_entrega: a.fecha_entrega,
  }));

  const limites = {
    max_evaluaciones_por_dia: configuracion.max_evaluaciones_por_dia,
    max_entregas_por_dia: configuracion.max_entregas_por_dia,
  };

  const alertas = evaluarCalendarioActividad({
    ahora: new Date(),
    fecha_entrega: consulta.fecha_entrega,
    tipo: consulta.tipo,
    exigir_futuro: consulta.exigir_futuro,
    periodo: { numero: efectivo.numero, fecha_inicio: efectivo.fecha_inicio, fecha_fin: efectivo.fecha_fin },
    eventos: contexto.anio.eventos,
    dias_habiles: contexto.jornada.dias_habiles,
    del_grupo: delGrupo,
    limites,
  });

  return {
    alertas,
    carga_del_dia: delGrupo.map(({ titulo, tipo, asignatura }) => ({ titulo, tipo, asignatura })),
    limites,
  };
}

/**
 * Los BLOQUEO no se pueden saltar; las ADVERTENCIA exigen que el docente las confirme (`confirmar_alertas`), porque a
 * veces son legítimas (un proyecto de vacaciones, un sábado de jornada).
 */
export function exigirAlertasResueltas(alertas: AlertaCalendario[], confirmadas: boolean): void {
  const bloqueos = alertas.filter((a) => a.severidad === 'BLOQUEO');
  if (bloqueos.length > 0) throw new ApiError(400, bloqueos.map((a) => a.mensaje).join(' '), { alertas });

  const advertencias = alertas.filter((a) => a.severidad === 'ADVERTENCIA');
  if (advertencias.length > 0 && !confirmadas) {
    throw new ApiError(409, `Revisa el calendario antes de continuar: ${advertencias.map((a) => a.mensaje).join(' ')} Confirma para programarla de todos modos.`, { alertas });
  }
}
