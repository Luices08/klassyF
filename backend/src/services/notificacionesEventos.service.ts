import { Types } from 'mongoose';
import { ESTADOS_MATRICULA_ACTIVOS, Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import Activity from '../models/activity.model';
import AcademicYear from '../models/academicYear.model';
import Area from '../models/area.model';
import Enrollment from '../models/enrollment.model';
import Subject from '../models/subject.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import User from '../models/user.model';
import { finDelDia } from '../utils/calendarioAcademico';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { acudientesConPortalDe, usuariosConRol } from './destinatariosNotificacion.service';
import { avisar, sumarInsignia } from './notificaciones.service';

type Id = Types.ObjectId | string;

/**
 * Puntos de emisión de M28. Cada módulo llama UNA función de aquí después de su propia escritura: un aviso que falla nunca tumba
 * la acción de negocio que lo originó (igual que la auditoría), solo se deja en consola.
 */
async function sinRomper(que: string, accion: () => Promise<void>): Promise<void> {
  try {
    await accion();
  } catch (err) {
    console.error(`No se pudo emitir la notificación (${que}):`, err);
  }
}

/** Suma el contador del menú a todos los que tienen esos perfiles (y, si se da la sede, atienden esa sede). */
async function insigniaParaRoles(roles: Rol[], ruta: string, sedeId?: Id): Promise<void> {
  for (const rol of roles) await sumarInsignia({ destinatarios: await usuariosConRol([rol], sedeId), rol, ruta });
}

const nombreCompleto = (u: { nombre: string; apellido: string } | null | undefined) => (u ? `${u.nombre} ${u.apellido}` : undefined);

/** M11: un estudiante entregó. Se agrupa por actividad en la campanita del docente («Tienes 145 entregas nuevas…») y suma en su menú. */
export function avisarEntregaNueva(actividad: { _id: Id; titulo: string }, docenteId: Id): Promise<void> {
  return sinRomper('entrega nueva', async () => {
    await avisar({
      destinatarios: [docenteId],
      rol: ROLES.DOCENTE,
      evento: 'ENTREGA_NUEVA',
      entidad_id: String(actividad._id),
      datos: { actividad: actividad.titulo },
      ruta: '/docente/actividades',
    });
    await sumarInsignia({ destinatarios: [docenteId], rol: ROLES.DOCENTE, ruta: '/docente/actividades' });
  });
}

/** M12: el docente calificó. Cada estudiante recibe un aviso por actividad (si no lo había leído, no se duplica). */
export function avisarActividadesCalificadas(actividadesPorEstudiante: Array<{ estudianteId: Id; actividadId: Id }>): Promise<void> {
  return sinRomper('actividad calificada', async () => {
    const titulos = new Map((await Activity.find({ _id: { $in: actividadesPorEstudiante.map((a) => a.actividadId) } }).select('titulo').lean()).map((a) => [String(a._id), a.titulo]));
    for (const { estudianteId, actividadId } of actividadesPorEstudiante) {
      await avisar({
        destinatarios: [estudianteId],
        rol: ROLES.ESTUDIANTE,
        evento: 'ACTIVIDAD_CALIFICADA',
        entidad_id: String(actividadId),
        datos: { actividad: titulos.get(String(actividadId)) },
        ruta: '/mis-notas',
      });
    }
  });
}

/** M07: un plan quedó en revisión → coordinación tiene trabajo pendiente en «Revisión de planeación». */
export function avisarPlanEnRevision(): Promise<void> {
  return sinRomper('plan en revisión', async () => {
    await insigniaParaRoles([ROLES.ADMIN, ROLES.COORDINADOR], '/admin/revision-planeacion');
  });
}

/** M07: coordinación decidió. El docente recibe el resultado en su campanita (una devolución es lo más importante). */
export function avisarPlanRevisado(plan: { _id: Id; docenteId: Id; decision: 'APROBADO' | 'DEVUELTO'; subjectId?: Id; areaId?: Id }): Promise<void> {
  return sinRomper('plan revisado', async () => {
    const [asignatura, area] = await Promise.all([
      plan.subjectId ? Subject.findById(plan.subjectId).select('nombre').lean() : null,
      plan.areaId ? Area.findById(plan.areaId).select('nombre').lean() : null,
    ]);
    await avisar({
      destinatarios: [plan.docenteId],
      rol: ROLES.DOCENTE,
      evento: plan.decision === 'DEVUELTO' ? 'PLAN_DEVUELTO' : 'PLAN_APROBADO',
      entidad_id: String(plan._id),
      datos: { asignatura: asignatura?.nombre, area: area?.nombre },
      ruta: '/docente/planeacion',
    });
  });
}

/** M04: subieron un documento de matrícula (secretaría o acudiente) → bandeja «Documentos por revisar» de secretaría y coordinación. */
export function avisarDocumentoPorRevisar(): Promise<void> {
  return sinRomper('documento por revisar', async () => {
    await insigniaParaRoles([ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA], '/admin/documentos-por-revisar');
  });
}

/** M04: secretaría rechazó un documento → el acudiente lo sabe en su campanita y lo sube de nuevo desde el portal. */
export function avisarDocumentoRechazado(enrollment: { _id: Id; student_id: Id }, motivo: string | undefined): Promise<void> {
  return sinRomper('documento rechazado', async () => {
    const [estudiante, acudientes] = await Promise.all([User.findById(enrollment.student_id).select('nombre apellido').lean(), acudientesConPortalDe([enrollment.student_id])]);
    await avisar({
      destinatarios: acudientes,
      rol: ROLES.ACUDIENTE,
      evento: 'DOCUMENTO_RECHAZADO',
      entidad_id: String(enrollment._id),
      datos: { estudiante: nombreCompleto(estudiante), motivo },
      ruta: '/portal',
    });
  });
}

/** M17: el boletín de un grupo se publicó → cada estudiante y sus acudientes. */
export function avisarBoletinPublicado(grupo: { groupId: Id; academicYearId: Id; periodo: number }): Promise<void> {
  return sinRomper('boletín publicado', async () => {
    const matriculas = await Enrollment.find({ group_id: grupo.groupId, academic_year_id: grupo.academicYearId, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } })
      .select('student_id')
      .lean();
    const estudiantes = await User.find({ _id: { $in: matriculas.map((m) => m.student_id) } }).select('nombre apellido').lean();
    for (const e of estudiantes) {
      const entidad = `${String(grupo.groupId)}:${grupo.periodo}:${String(e._id)}`;
      await avisar({ destinatarios: [e._id], rol: ROLES.ESTUDIANTE, evento: 'BOLETIN_PUBLICADO', entidad_id: entidad, datos: { periodo: grupo.periodo }, ruta: '/report-card' });
      await avisar({
        destinatarios: await acudientesConPortalDe([e._id]),
        rol: ROLES.ACUDIENTE,
        evento: 'BOLETIN_PUBLICADO',
        entidad_id: entidad,
        datos: { periodo: grupo.periodo, estudiante: nombreCompleto(e) },
        ruta: '/report-card',
      });
    }
  });
}

/** M14: se registró una falta Tipo II/III → los acudientes del presunto responsable (sin detalle) y coordinación de convivencia de la sede. */
export function avisarFaltaGrave(falta: { observacionId: Id; estudianteId: Id; sedeId: Id | null; hayCaso: boolean }): Promise<void> {
  return sinRomper('falta grave', async () => {
    const [estudiante, acudientes] = await Promise.all([User.findById(falta.estudianteId).select('nombre apellido').lean(), acudientesConPortalDe([falta.estudianteId])]);
    await avisar({
      destinatarios: acudientes,
      rol: ROLES.ACUDIENTE,
      evento: 'FALTA_GRAVE',
      entidad_id: String(falta.observacionId),
      datos: { estudiante: nombreCompleto(estudiante) },
      ruta: '/portal',
    });
    if (falta.hayCaso) {
      await insigniaParaRoles([ROLES.ADMIN, ROLES.COORDINADOR_CONVIVENCIA], '/convivencia/solicitudes', falta.sedeId ?? undefined);
    }
  });
}

/** Días de anticipación con los que se recuerda el cierre de notas de un periodo. */
export const DIAS_RECORDATORIO_CIERRE = 7;

/**
 * Recordatorio de cierre de periodo para docentes con clases y coordinación. No hay planificador interno: se ejecuta a diario desde
 * el servidor (`npm run notificar:cierres`). Es idempotente: mientras el aviso siga sin leer, solo actualiza «en cuántos días».
 */
export async function recordarCierresDePeriodo(ahora = new Date()): Promise<{ avisos: number }> {
  const anio = await AcademicYear.findOne({ estado: 'EN_CURSO' }).lean();
  if (!anio) return { avisos: 0 };
  let avisos = 0;
  for (const periodo of anio.periodos) {
    if (periodo.estado !== 'ABIERTO' && periodo.estado !== 'EN_DIGITACION') continue;
    const cierre = periodo.fecha_cierre_notas ?? periodo.fecha_fin;
    const dias = Math.ceil((finDelDia(cierre).getTime() - ahora.getTime()) / 86_400_000) - 1;
    if (dias < 0 || dias > DIAS_RECORDATORIO_CIERRE) continue;

    const docentes = await TeacherAssignment.distinct('docente_id', { academic_year_id: anio._id, tipo_asignacion: 'CLASE', estado: ESTADO_ACTIVO });
    const entidad = `${String(anio._id)}:${periodo.numero}`;
    await avisar({ destinatarios: docentes, rol: ROLES.DOCENTE, evento: 'CIERRE_PERIODO_PROXIMO', entidad_id: entidad, datos: { periodo: periodo.numero, dias }, ruta: '/docente/notas' });
    for (const rol of [ROLES.ADMIN, ROLES.COORDINADOR]) {
      await avisar({ destinatarios: await usuariosConRol([rol]), rol, evento: 'CIERRE_PERIODO_PROXIMO', entidad_id: entidad, datos: { periodo: periodo.numero, dias }, ruta: '/admin/notas' });
    }
    avisos += 1;
  }
  return { avisos };
}
