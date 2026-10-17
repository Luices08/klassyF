import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { ROLES } from '../constants/roles';
import CalificacionAsignatura from '../models/calificacionAsignatura.model';
import Enrollment from '../models/enrollment.model';
import EvaluacionPromocion from '../models/evaluacionPromocionEstudiante.model';
import ExpedienteInclusion from '../models/expedienteInclusion.model';
import Group from '../models/group.model';
import Observacion from '../models/observacion.model';
import Recuperacion from '../models/recuperacion.model';
import RemisionOrientacion from '../models/remisionOrientacion.model';
import SesionComision from '../models/sesionComision.model';
import Subject from '../models/subject.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { registrarEvento } from './audit.service';
import { calcularEstadisticas } from './attendanceStats.service';

/** Rectoría y coordinación siempre; un docente o integrante solo si el estudiante está en una sesión de la que forma parte. */
async function exigirAcceso(usuario: UserDocument, studentId: string, anioId: string): Promise<void> {
  if (usuario.rol === ROLES.ADMIN || usuario.rol === ROLES.COORDINADOR) return;
  const enSesion = await SesionComision.exists({ academic_year_id: anioId, 'miembros.user_id': usuario._id, 'casos.student_id': studentId });
  if (!enSesion) throw new ApiError(404, 'Estudiante no encontrado.');
}

/**
 * La ficha técnica del estudiante para deliberar (M20). Solo REÚNE lo que ya guardan M12 (notas por periodo), M13 (inasistencias justificadas
 * y no), M18 (recuperaciones), M14/M15 (cuántos registros y de qué gravedad, sin su contenido), M16 (solo si tiene ajustes razonables),
 * el cierre de M19 y los compromisos de sesiones anteriores. El detalle de convivencia y orientación vive en su propio módulo con sus permisos:
 * aquí nunca se copia (la comisión incluye docentes y padres, que no ven lo confidencial).
 */
export async function fichaDeEstudiante(studentId: string, anioId: string, usuario: UserDocument) {
  await exigirAcceso(usuario, studentId, anioId);
  const estudiante = await User.findById(studentId).select('nombre apellido numero_documento');
  const matricula = await Enrollment.findOne({ student_id: studentId, academic_year_id: anioId, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } });
  if (!estudiante || !matricula) throw new ApiError(404, 'Estudiante no encontrado.');
  const grupo = await Group.findById(matricula.group_id).populate<{ grade_id: { nombre: string } }>('grade_id', 'nombre');

  const [calificaciones, recuperaciones, asistencia, observaciones, remisiones, piar, cierre, sesiones] = await Promise.all([
    CalificacionAsignatura.find({ academic_year_id: anioId, student_id: studentId }).select('subject_id periodo_numero estado resultado.nota_asignatura').lean(),
    Recuperacion.find({ academic_year_id: anioId, student_id: studentId }).lean(),
    calcularEstadisticas({ academic_year_id: anioId, agrupar_por: 'periodo', student_id: studentId }, null),
    Observacion.aggregate<{ _id: { clase: string; gravedad: string | null }; total: number }>([
      { $match: { academic_year_id: matricula.academic_year_id, student_id: matricula.student_id, estado: 'ACTIVA' } },
      { $group: { _id: { clase: '$clase', gravedad: '$falta.gravedad' }, total: { $sum: 1 } } },
    ]),
    RemisionOrientacion.countDocuments({ student_id: studentId }),
    ExpedienteInclusion.exists({ academic_year_id: anioId, student_id: studentId, tipo: 'PIAR', estado: 'ACTIVO' }),
    EvaluacionPromocion.findOne({ academic_year_id: anioId, student_id: studentId, vigente: true }).select('resultado version momento detalle.motivos').lean(),
    SesionComision.find({ academic_year_id: anioId, 'casos.student_id': studentId, estado: { $ne: 'ANULADA' } }).select('instancia codigo fecha estado compromisos').lean(),
  ]);

  const asignaturas = await Subject.find({ _id: { $in: [...new Set(calificaciones.map((c) => String(c.subject_id)))] } }).select('nombre');
  const nombreAsignatura = new Map(asignaturas.map((s) => [String(s._id), s.nombre]));
  const porAsignatura = new Map<string, { asignatura: string; periodos: Array<{ periodo: number; nota: number | null; estado: string }> }>();
  for (const c of calificaciones) {
    const k = String(c.subject_id);
    const fila = porAsignatura.get(k) ?? { asignatura: nombreAsignatura.get(k) ?? 'Asignatura', periodos: [] };
    fila.periodos.push({ periodo: c.periodo_numero, nota: c.resultado?.nota_asignatura ?? null, estado: c.estado });
    porAsignatura.set(k, fila);
  }
  for (const fila of porAsignatura.values()) fila.periodos.sort((a, b) => a.periodo - b.periodo);

  const compromisos = sesiones.flatMap((s) =>
    s.compromisos
      .filter((k) => String(k.student_id) === studentId)
      .map((k) => ({ sesion: s.codigo ?? `${s.instancia} (${s.estado})`, descripcion: k.descripcion, responsable: k.responsable_nombre, fecha_limite: k.fecha_limite, estado: k.estado }))
  );
  const subtotal = (clase: string) => observaciones.filter((o) => o._id.clase === clase).reduce((suma, o) => suma + o.total, 0);

  await registrarEvento({ usuario_id: usuario._id, accion: 'COMISION_FICHA_CONSULTADA', entidad: 'User', entidad_id: studentId, detalle: `Año ${anioId}` });
  return {
    estudiante: { _id: studentId, nombre: estudiante.nombre, apellido: estudiante.apellido, numero_documento: estudiante.numero_documento },
    grupo: grupo?.nomenclatura ?? '',
    grado: grupo?.grade_id?.nombre ?? '',
    notas_por_periodo: [...porAsignatura.values()].sort((a, b) => a.asignatura.localeCompare(b.asignatura, 'es')),
    recuperaciones: recuperaciones.map((r) => ({ asignatura: nombreAsignatura.get(String(r.subject_id)) ?? 'Asignatura', tipo: r.tipo, periodo: r.periodo_numero, nota_original: r.nota_original, nota_resultante: r.nota_resultante, estado: r.estado, intentos: r.intentos.length })),
    inasistencias: {
      por_periodo: asistencia.filas.map((f) => ({ periodo: Number(f.clave), total: f.total_registros, justificadas: f.fallas_justificadas, injustificadas: f.fallas_injustificadas })),
      total: { total: asistencia.total.total_registros, justificadas: asistencia.total.fallas_justificadas, injustificadas: asistencia.total.fallas_injustificadas },
    },
    convivencia: {
      observaciones: subtotal('OBSERVACION'),
      faltas: Object.fromEntries(['I', 'II', 'III'].map((g) => [g, observaciones.filter((o) => o._id.clase === 'FALTA' && o._id.gravedad === g).reduce((suma, o) => suma + o.total, 0)])),
      nota: 'El detalle está en el Observador del estudiante, con sus propios permisos.',
    },
    orientacion: { tiene_remisiones: remisiones > 0 },
    tiene_piar: Boolean(piar),
    cierre_promocion: cierre ? { resultado: cierre.resultado, version: cierre.version, momento: cierre.momento } : null,
    compromisos_previos: compromisos,
  };
}
