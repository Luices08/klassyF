import { Router } from 'express';
import academicYearRoutes from './academicYear.routes';
import activityRoutes from './activity.routes';
import admissionRequestRoutes from './admissionRequest.routes';
import areaRoutes from './area.routes';
import asistenteRoutes from './asistente.routes';
import boletinRoutes from './boletin.routes';
import attendanceRoutes from './attendance.routes';
import auditLogRoutes from './auditLog.routes';
import authRoutes from './auth.routes';
import campusRoutes from './campus.routes';
import certificadoRoutes from './certificado.routes';
import citacionRoutes from './citacion.routes';
import casoRoutes from './caso.routes';
import orientacionRoutes from './orientacion.routes';
import documentoReferenciaRoutes from './documentoReferencia.routes';
import enrollmentRoutes from './enrollment.routes';
import requisitoDocumentalRoutes from './requisitoDocumental.routes';
import pazYSalvoRoutes from './pazYSalvo.routes';
import espacioRoutes from './espacio.routes';
import gradeRoutes from './grade.routes';
import groupRoutes from './group.routes';
import guardianRoutes from './guardian.routes';
import horarioRoutes from './horario.routes';
import inclusionRoutes from './inclusion.routes';
import institutionRoutes from './institution.routes';
import jornadaOperativaRoutes from './jornadaOperativa.routes';
import liderAreaRoutes from './liderArea.routes';
import notasRoutes from './notas.routes';
import notificacionRoutes from './notificacion.routes';
import observacionRoutes from './observacion.routes';
import periodLockRoutes from './periodLock.routes';
import portalAcudienteRoutes from './portalAcudiente.routes';
import planAreaRoutes from './planArea.routes';
import planAulaRoutes from './planAula.routes';
import publicRoutes from './public.routes';
import promocionRoutes from './promocion.routes';
import promocionAnticipadaRoutes from './promocionAnticipada.routes';
import comisionRoutes from './comision.routes';
import titulacionRoutes from './titulacion.routes';
import recuperacionRoutes from './recuperacion.routes';
import reportCardRoutes from './reportCard.routes';
import studentRoutes from './student.routes';
import studyPlanRoutes from './studyPlan.routes';
import subjectRoutes from './subject.routes';
import teacherAssignmentRoutes from './teacherAssignment.routes';
import salidaRoutes from './salida.routes';
import trasladoRoutes from './traslado.routes';
import userRoutes from './user.routes';
import ventanaPlanesRoutes from './ventanaPlanes.routes';

const router = Router();

router.use('/auth', authRoutes);

// M28: campanita, contadores del menú y tablero de anuncios
router.use('/notificaciones', notificacionRoutes);
router.use('/users', userRoutes);

// Asistente flotante: orienta al usuario hacia la pantalla que busca
router.use('/asistente', asistenteRoutes);
router.use('/audit-logs', auditLogRoutes);
router.use('/institution', institutionRoutes);
router.use('/campuses', campusRoutes);
router.use('/shifts', jornadaOperativaRoutes);
router.use('/grades', gradeRoutes);
router.use('/groups', groupRoutes);
router.use('/enrollments', enrollmentRoutes);
router.use('/requisitos-documentales', requisitoDocumentalRoutes);
router.use('/paz-y-salvo', pazYSalvoRoutes);
// Traslados extemporáneos y homologación de notas (M04/M26), con las escalas de otras instituciones (M32)
router.use('/traslados', trasladoRoutes);
// M24: citaciones a acudientes (generales y particulares) con correo en cola
router.use('/citaciones', citacionRoutes);
// Retiro y traslado durante el año, con su paz y salvo de salida y el boletín parcial de retiro (M04/M26/M17)
router.use('/salidas', salidaRoutes);

// M10: Espacios fisicos (aulas, laboratorios, canchas)
router.use('/espacios', espacioRoutes);

// M09: Horarios (variables, generación, versiones y publicación)
router.use('/horarios', horarioRoutes);

// M05: Año lectivo, periodos académicos y calendario
router.use('/academic-years', academicYearRoutes);

// M03: Expediente y hoja de vida del estudiante
router.use('/students', studentRoutes);
router.use('/guardians', guardianRoutes);

// M04: Admisiones — revision interna de secretaria y sitio publico sin login
router.use('/admission-requests', admissionRequestRoutes);
router.use('/public', publicRoutes);

// M06/M08: catálogo académico, plan de estudios y carga docente
router.use('/curriculum/areas', areaRoutes);
router.use('/curriculum/subjects', subjectRoutes);
router.use('/curriculum/study-plan', studyPlanRoutes);
router.use('/teacher-assignments', teacherAssignmentRoutes);

// M07: Planeación documental (PDF) — documentos de apoyo, plan de área anual y plan de aula por periodo
router.use('/planeacion/documentos-referencia', documentoReferenciaRoutes);
router.use('/planeacion/lideres-area', liderAreaRoutes);
router.use('/planeacion/planes-area', planAreaRoutes);
router.use('/planeacion/planes-aula', planAulaRoutes);
router.use('/planeacion/ventanas', ventanaPlanesRoutes);

// M14: Observaciones y convivencia (Observador)
router.use('/observaciones', observacionRoutes);

// M15: Comité de convivencia escolar (casos, protocolos, medidas y entidades de remisión)
router.use('/convivencia', casoRoutes);

// Orientación: remisiones que convivencia le envía desde un caso (psicología / orientación escolar)
router.use('/orientacion', orientacionRoutes);

// M16: Inclusión (PIAR, plan de apoyo pedagógico y sus documentos)
router.use('/inclusion', inclusionRoutes);

// M26: Secretaría académica — certificados y constancias con QR y huella de integridad
router.use('/certificados', certificadoRoutes);

// Prompt 3: Actividades, Calificaciones, Asistencia y Motor de Boletines
router.use('/activities', activityRoutes);
router.use('/attendance', attendanceRoutes);

// M12: Evaluación y notas (planilla, cierre, definitivas, Excel offline)
router.use('/notas', notasRoutes);
router.use('/periods', periodLockRoutes);
router.use('/reports', reportCardRoutes);

// M17: Boletines — configuración del colegio, banco de textos por desempeño y observaciones del docente
router.use('/boletines', boletinRoutes);

// M18: Recuperaciones — política del colegio (por periodo y de fin de año), candidatos y registro de intentos
router.use('/recuperaciones', recuperacionRoutes);

// M19: Promoción y cierre del año — política del SIEE (reglas de promoción, arrastre, PIAR)
router.use('/promocion', promocionRoutes);

// M19 (fase 6): promoción anticipada — trámite, consentimiento, resolución rectoral y aplicación al grado siguiente
router.use('/promocion-anticipada', promocionAnticipadaRoutes);

// M26/M19: titulación de bachiller — servicio social, Saber 11, carpeta académica y situación de graduación
router.use('/titulacion', titulacionRoutes);

// M20: Comisión de Evaluación y Promoción — tablero de riesgo, sesiones, votos, compromisos y actas
router.use('/comision', comisionRoutes);

// M27: Portal del acudiente — lo de cada hijo (notas, inasistencias, convivencia), sus documentos de matrícula y certificados de autoservicio
router.use('/portal', portalAcudienteRoutes);

export default router;
