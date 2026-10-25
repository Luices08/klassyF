import { Types } from 'mongoose';
import { ESTADOS_MATRICULA_ACTIVOS, Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import { pestanaDeAsignatura, pestanaDeClase, pestanaDeHijo } from '../constants/notificaciones';
import Activity from '../models/activity.model';
import AcademicYear from '../models/academicYear.model';
import Area from '../models/area.model';
import Enrollment from '../models/enrollment.model';
import Group from '../models/group.model';
import Subject from '../models/subject.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import User from '../models/user.model';
import { finDelDia, inicioDelDia } from '../utils/calendarioAcademico';
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
async function insigniaParaRoles(roles: Rol[], ruta: string, sedeId?: Id, pestana?: string, cantidad?: number, excluir?: Id): Promise<void> {
  for (const rol of roles) {
    const destinatarios = (await usuariosConRol([rol], sedeId)).filter((u) => !excluir || String(u) !== String(excluir));
    await sumarInsignia({ destinatarios, rol, ruta, pestana, cantidad });
  }
}

const nombreCompleto = (u: { nombre: string; apellido: string } | null | undefined) => (u ? `${u.nombre} ${u.apellido}` : undefined);

/**
 * M11: un estudiante entregó. Se agrupa por actividad en la campanita del docente («Tienes 145 entregas nuevas…»), que lleva directo a la
 * página de esa actividad, y suma un punto en el botón del grupo (la clase) donde ocurrió.
 */
export function avisarEntregaNueva(actividad: { _id: Id; titulo: string }, asignacion: { _id: Id; group_id?: Id | null; docente_id: Id }): Promise<void> {
  return sinRomper('entrega nueva', async () => {
    const grupo = asignacion.group_id ? await Group.findById(asignacion.group_id).select('nomenclatura').lean() : null;
    await avisar({
      destinatarios: [asignacion.docente_id],
      rol: ROLES.DOCENTE,
      evento: 'ENTREGA_NUEVA',
      entidad_id: String(actividad._id),
      datos: { actividad: actividad.titulo, grupo: grupo?.nomenclatura },
      ruta: `/docente/actividades/${String(actividad._id)}`,
    });
    await sumarInsignia({ destinatarios: [asignacion.docente_id], rol: ROLES.DOCENTE, ruta: '/docente/actividades', pestana: pestanaDeClase(asignacion._id) });
  });
}

/** M12: el docente calificó. Cada estudiante recibe un aviso por actividad (si no lo había leído, no se duplica). */
export function avisarActividadesCalificadas(actividadesPorEstudiante: Array<{ estudianteId: Id; actividadId: Id }>): Promise<void> {
  return sinRomper('actividad calificada', async () => {
    const actividades = new Map(
      (await Activity.find({ _id: { $in: actividadesPorEstudiante.map((a) => a.actividadId) } }).select('titulo requiere_entrega').lean()).map((a) => [String(a._id), a])
    );
    for (const { estudianteId, actividadId } of actividadesPorEstudiante) {
      await avisar({
        destinatarios: [estudianteId],
        rol: ROLES.ESTUDIANTE,
        evento: 'ACTIVIDAD_CALIFICADA',
        entidad_id: String(actividadId),
        datos: { actividad: actividades.get(String(actividadId))?.titulo },
        // Una actividad que se entrega en línea tiene su página; una de aula solo existe en las notas.
        ruta: actividades.get(String(actividadId))?.requiere_entrega === false ? '/mis-notas' : `/mis-actividades/${String(actividadId)}`,
      });
      await sumarInsignia({ destinatarios: [estudianteId], rol: ROLES.ESTUDIANTE, ruta: '/mis-notas' });
    }
  });
}

/** M07: un plan quedó en revisión → coordinación tiene trabajo pendiente en la pestaña de planes de aula o de área de «Revisión de planeación». */
export function avisarPlanEnRevision(tipo: 'aula' | 'area'): Promise<void> {
  return sinRomper('plan en revisión', async () => {
    await insigniaParaRoles([ROLES.ADMIN, ROLES.COORDINADOR], '/admin/revision-planeacion', undefined, tipo === 'aula' ? 'aulas' : 'areas');
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
    await sumarInsignia({ destinatarios: [plan.docenteId], rol: ROLES.DOCENTE, ruta: '/docente/planeacion', pestana: plan.subjectId ? 'aula' : 'area' });
  });
}

/** M04: subieron un documento de matrícula (secretaría o acudiente) → bandeja «Documentos por revisar» de secretaría y coordinación. */
export function avisarDocumentoPorRevisar(subidoPor?: Id | null): Promise<void> {
  return sinRomper('documento por revisar', async () => {
    // Quien lo subió no necesita un aviso de lo que acaba de hacer.
    await insigniaParaRoles([ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA], '/admin/documentos-por-revisar', undefined, undefined, undefined, subidoPor ?? undefined);
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
    await sumarInsignia({ destinatarios: acudientes, rol: ROLES.ACUDIENTE, ruta: '/portal', pestana: pestanaDeHijo('documentos', enrollment.student_id) });
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
      await sumarInsignia({ destinatarios: [e._id], rol: ROLES.ESTUDIANTE, ruta: '/report-card' });
      const acudientes = await acudientesConPortalDe([e._id]);
      await sumarInsignia({ destinatarios: acudientes, rol: ROLES.ACUDIENTE, ruta: '/report-card' });
      await avisar({
        destinatarios: acudientes,
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
    await sumarInsignia({ destinatarios: acudientes, rol: ROLES.ACUDIENTE, ruta: '/portal', pestana: pestanaDeHijo('convivencia', falta.estudianteId) });
    if (falta.hayCaso) {
      await insigniaParaRoles([ROLES.ADMIN, ROLES.COORDINADOR_CONVIVENCIA], '/convivencia/solicitudes', falta.sedeId ?? undefined);
    }
  });
}

/** M11: una actividad ya publicada → los estudiantes del grupo la ven en su campanita (agrupada por asignatura) y en la pestaña «Pendientes». */
export function avisarActividadNueva(asignacion: { _id: Id; group_id?: Id | null; subject_id?: Id | null; academic_year_id: Id }): Promise<void> {
  return sinRomper('actividad nueva', async () => {
    if (!asignacion.group_id) return;
    const [matriculas, asignatura] = await Promise.all([
      Enrollment.find({ group_id: asignacion.group_id, academic_year_id: asignacion.academic_year_id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } }).select('student_id').lean(),
      asignacion.subject_id ? Subject.findById(asignacion.subject_id).select('nombre').lean() : null,
    ]);
    const estudiantes = matriculas.map((m) => m.student_id);
    await avisar({ destinatarios: estudiantes, rol: ROLES.ESTUDIANTE, evento: 'ACTIVIDAD_NUEVA', entidad_id: String(asignacion._id), datos: { asignatura: asignatura?.nombre }, ruta: asignacion.subject_id ? `/mis-actividades?asignatura=${String(asignacion.subject_id)}` : '/mis-actividades' });
    await sumarInsignia({ destinatarios: estudiantes, rol: ROLES.ESTUDIANTE, ruta: '/mis-actividades', pestana: asignacion.subject_id ? pestanaDeAsignatura(asignacion.subject_id) : 'pendientes' });
  });
}

/** M13: estudiantes que acaban de quedar con una inasistencia (solo el paso a falla: volver a guardar la planilla no cuenta doble). */
export function avisarInasistencias(estudiantes: Id[]): Promise<void> {
  return sinRomper('inasistencias', async () => {
    for (const estudianteId of new Set(estudiantes.map(String))) {
      const [estudiante, acudientes] = await Promise.all([User.findById(estudianteId).select('nombre apellido').lean(), acudientesConPortalDe([estudianteId])]);
      await avisar({ destinatarios: acudientes, rol: ROLES.ACUDIENTE, evento: 'INASISTENCIA_REGISTRADA', entidad_id: estudianteId, datos: { estudiante: nombreCompleto(estudiante) }, ruta: '/portal' });
      await sumarInsignia({ destinatarios: acudientes, rol: ROLES.ACUDIENTE, ruta: '/portal', pestana: pestanaDeHijo('inasistencias', estudianteId) });
    }
  });
}

/**
 * M14: registros que la familia SÍ puede ver (no confidenciales, de tipos visibles al estudiante, o una falta Tipo I). Los confidenciales y las
 * faltas II/III no pasan por aquí: esas tienen su propia regla (`avisarFaltaGrave`).
 */
export function avisarObservacionesVisibles(estudiantes: Id[]): Promise<void> {
  return sinRomper('observaciones', async () => {
    for (const estudianteId of new Set(estudiantes.map(String))) {
      const [estudiante, acudientes] = await Promise.all([User.findById(estudianteId).select('nombre apellido').lean(), acudientesConPortalDe([estudianteId])]);
      await avisar({ destinatarios: acudientes, rol: ROLES.ACUDIENTE, evento: 'OBSERVACION_REGISTRADA', entidad_id: estudianteId, datos: { estudiante: nombreCompleto(estudiante) }, ruta: '/portal' });
      await sumarInsignia({ destinatarios: acudientes, rol: ROLES.ACUDIENTE, ruta: '/portal', pestana: pestanaDeHijo('convivencia', estudianteId) });
      await sumarInsignia({ destinatarios: [estudianteId], rol: ROLES.ESTUDIANTE, ruta: '/mi-observador' });
    }
  });
}

/** M13: alguien justificó una inasistencia → coordinación la tiene por revisar en la pestaña «Justificaciones». */
export function avisarJustificacionPorRevisar(): Promise<void> {
  return sinRomper('justificación por revisar', async () => {
    await insigniaParaRoles([ROLES.ADMIN, ROLES.COORDINADOR], '/asistencia/gestion', undefined, 'justificaciones');
  });
}

/** M13: coordinación decidió → el acudiente lo sabe (campanita y pestaña «Inasistencias» de ese hijo). */
export function avisarJustificacionRevisada(justificacion: { _id: Id; student_id: Id }, decision: 'APROBADA' | 'RECHAZADA', motivo?: string | null): Promise<void> {
  return sinRomper('justificación revisada', async () => {
    const [estudiante, acudientes] = await Promise.all([User.findById(justificacion.student_id).select('nombre apellido').lean(), acudientesConPortalDe([justificacion.student_id])]);
    await avisar({
      destinatarios: acudientes,
      rol: ROLES.ACUDIENTE,
      evento: 'JUSTIFICACION_REVISADA',
      entidad_id: String(justificacion._id),
      datos: { estudiante: nombreCompleto(estudiante), decision, motivo: motivo ?? undefined },
      ruta: '/portal',
    });
    await sumarInsignia({ destinatarios: acudientes, rol: ROLES.ACUDIENTE, ruta: '/portal', pestana: pestanaDeHijo('inasistencias', justificacion.student_id) });
  });
}

/** M16: llegó una solicitud de apoyo → orientación de esa sede (y el ADMIN) la ve en la pestaña «Solicitudes de apoyo». */
export function avisarSolicitudApoyo(sedeId: Id): Promise<void> {
  return sinRomper('solicitud de apoyo', async () => {
    await insigniaParaRoles([ROLES.ORIENTADOR, ROLES.ADMIN], '/inclusion', sedeId, 'solicitudes');
  });
}

/** M15: convivencia remitió estudiantes a orientación → bandeja «Remisiones a orientación» de esa sede. */
export function avisarRemisionesOrientacion(sedeId: Id, cantidad: number): Promise<void> {
  return sinRomper('remisión a orientación', async () => {
    if (cantidad > 0) await insigniaParaRoles([ROLES.ORIENTADOR, ROLES.ADMIN], '/orientacion/remisiones', sedeId, undefined, cantidad);
  });
}

/** M04: alguien se preinscribió desde el sitio público → bandeja de admisiones. */
export function avisarSolicitudAdmision(): Promise<void> {
  return sinRomper('solicitud de admisión', async () => {
    await insigniaParaRoles([ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA], '/admin/admisiones');
  });
}

/** Tablero: un anuncio ya vigente → punto en «Anuncios» de cada perfil al que va dirigido (no del autor). */
export function avisarAnuncioNuevo(roles: Rol[], autorId: Id): Promise<void> {
  return sinRomper('anuncio nuevo', async () => {
    for (const rol of roles) {
      const destinatarios = (await usuariosConRol([rol])).filter((id) => String(id) !== String(autorId));
      await sumarInsignia({ destinatarios, rol, ruta: '/anuncios' });
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

/**
 * Eventos del calendario (M05) que un docente debe tener presentes: el desarrollo institucional. Las recuperaciones ya no pasan por aquí:
 * tienen sus propios avisos (fechas, inicio y «mañana termina», solo a quien tiene estudiantes por recuperar) en `recuperacionAvisos.service`.
 */
const EVENTOS_QUE_SE_RECUERDAN = ['DESARROLLO_INSTITUCIONAL'] as const;
export const DIAS_RECORDATORIO_EVENTO = 3;

/** Igual que `recordarCierresDePeriodo`: se corre una vez al día (`npm run notificar:cierres`) y es idempotente mientras el aviso siga sin leer. */
export async function recordarEventosDelCalendario(ahora = new Date()): Promise<{ avisos: number }> {
  const anio = await AcademicYear.findOne({ estado: 'EN_CURSO' }).lean();
  if (!anio) return { avisos: 0 };
  const docentes = await TeacherAssignment.distinct('docente_id', { academic_year_id: anio._id, tipo_asignacion: 'CLASE', estado: ESTADO_ACTIVO });
  let avisos = 0;
  for (const evento of anio.eventos) {
    if (!(EVENTOS_QUE_SE_RECUERDAN as readonly string[]).includes(evento.tipo)) continue;
    const dias = Math.ceil((inicioDelDia(evento.fecha_inicio).getTime() - ahora.getTime()) / 86_400_000);
    if (dias < 0 || dias > DIAS_RECORDATORIO_EVENTO) continue;
    await avisar({
      destinatarios: docentes,
      rol: ROLES.DOCENTE,
      evento: 'RECORDATORIO_CALENDARIO',
      entidad_id: `${String(anio._id)}:${String(evento._id)}`,
      datos: { nombre: evento.nombre, dias },
      ruta: '/anio-lectivo',
    });
    avisos += 1;
  }
  return { avisos };
}

/**
 * Actividades que se programaron con una fecha de publicación futura y ya llegó (en las últimas 24 h): los estudiantes se enteran el día que
 * se publican. Las que se crearon ya publicadas avisaron al crearse; por eso solo cuentan las creadas antes de su fecha de apertura.
 */
export async function avisarActividadesPublicadasHoy(ahora = new Date()): Promise<{ avisos: number }> {
  const desde = new Date(ahora.getTime() - 86_400_000);
  const actividades = await Activity.find({ fecha_apertura: { $gt: desde, $lte: ahora } }).select('teacher_assignment_id fecha_apertura createdAt').lean();
  const asignaciones = new Set(actividades.filter((a) => a.createdAt && a.createdAt.getTime() < a.fecha_apertura.getTime() - 60_000).map((a) => String(a.teacher_assignment_id)));
  let avisos = 0;
  for (const id of asignaciones) {
    const asignacion = await TeacherAssignment.findById(id).lean();
    if (!asignacion) continue;
    await avisarActividadNueva(asignacion);
    avisos += 1;
  }
  return { avisos };
}

/**
 * M24: una citación se creó, cambió de fecha/lugar o se canceló → campanita y punto del acudiente con portal, por estudiante. El correo
 * es aparte (`colaCorreo.service`); un acudiente sin cuenta de portal solo recibe el correo.
 */
export function avisarCitacion(
  citacion: { _id: Id; titulo: string; fechaLegible: string },
  evento: 'CITACION_NUEVA' | 'CITACION_REPROGRAMADA' | 'CITACION_CANCELADA',
  destinatarios: Array<{ student_id: Id; user_id: Id | null }>
): Promise<void> {
  return sinRomper('citación', async () => {
    const conPortal = destinatarios.filter((d) => d.user_id);
    const estudiantes = await User.find({ _id: { $in: conPortal.map((d) => d.student_id) } }).select('nombre apellido').lean();
    const nombres = new Map(estudiantes.map((e) => [String(e._id), nombreCompleto(e)]));
    for (const d of conPortal) {
      const estudianteId = String(d.student_id);
      await avisar({
        destinatarios: [d.user_id as Id],
        rol: ROLES.ACUDIENTE,
        evento,
        entidad_id: `${String(citacion._id)}:${estudianteId}`,
        datos: { nombre: citacion.titulo, estudiante: nombres.get(estudianteId), cuando: citacion.fechaLegible },
        ruta: '/portal',
      });
      await sumarInsignia({ destinatarios: [d.user_id as Id], rol: ROLES.ACUDIENTE, ruta: '/portal', pestana: pestanaDeHijo('citaciones', estudianteId) });
    }
  });
}

/** M24: un acudiente confirmó o declinó → quien convocó ve una sola alerta agrupada («5 acudientes respondieron a…») que abre la citación. */
export function avisarCitacionRespondida(citacion: { _id: Id; titulo: string; convocante_id: Id; convocante_rol: Rol }): Promise<void> {
  return sinRomper('respuesta a citación', async () => {
    await avisar({
      destinatarios: [citacion.convocante_id],
      rol: citacion.convocante_rol,
      evento: 'CITACION_RESPONDIDA',
      entidad_id: String(citacion._id),
      datos: { nombre: citacion.titulo },
      ruta: `/reuniones?citacion=${String(citacion._id)}`,
    });
  });
}

/** M20: sesión de comisión o consejo convocada → los integrantes con cuenta reciben la alerta en la campanita. */
export function avisarSesionConvocada(sesion: {
  _id: Id;
  instancia: string;
  fecha: Date;
  hora?: string | null;
  lugar?: string | null;
  miembros: Array<{ user_id?: Id | null }>;
}): Promise<void> {
  return sinRomper('sesion convocada', async () => {
    const userIds = sesion.miembros.map((m) => m.user_id).filter((u): u is Id => Boolean(u));
    if (userIds.length === 0) return;
    const usuarios = await User.find({ _id: { $in: userIds } }).select('_id roles').lean();
    const nombresInstancia: Record<string, string> = {
      COMISION_EVALUACION: 'Comisión de Evaluación y Promoción',
      CONSEJO_ACADEMICO: 'Consejo Académico',
      CONSEJO_DIRECTIVO: 'Consejo Directivo',
    };
    const cuando = `${new Date(sesion.fecha).toLocaleDateString('es-CO')}${sesion.hora ? ` a las ${sesion.hora}` : ''}${sesion.lugar ? ` (${sesion.lugar})` : ''}`;
    for (const u of usuarios) {
      const rol = u.roles?.[0] ?? ROLES.DOCENTE;
      await avisar({
        destinatarios: [u._id],
        rol,
        evento: 'SESION_COMISION_CONVOCADA',
        entidad_id: String(sesion._id),
        datos: { nombre: nombresInstancia[sesion.instancia] ?? 'Comisión', cuando },
        ruta: '/admin/comision',
      });
      await sumarInsignia({ destinatarios: [u._id], rol, ruta: '/admin/comision', pestana: 'sesiones' });
    }
  });
}
