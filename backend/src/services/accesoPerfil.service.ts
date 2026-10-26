import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import Enrollment from '../models/enrollment.model';
import Guardian from '../models/guardian.model';
import StudentGuardian from '../models/studentGuardian.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';

const ESTADOS_MATRICULA_ACTIVA = ['MATRICULADO_DEFINITIVO', 'MATRICULADO_CONDICIONAL'];

/**
 * Por qué un perfil no puede abrir sesión todavía (o null si puede). Es por perfil, no por persona: una docente cuyo
 * hijo sigue preinscrito entra como DOCENTE sin problema; solo el perfil de estudiante queda cerrado.
 */
export async function motivoSinAccesoAlPerfil(user: UserDocument, rol: Rol): Promise<string | null> {
  // Preinscritos no tienen acceso al portal interno: primero la secretaría formaliza la matrícula.
  if (rol === ROLES.ESTUDIANTE) {
    const matriculas = await Enrollment.find({ student_id: user._id });
    if (matriculas.length > 0 && !matriculas.some((m) => ESTADOS_MATRICULA_ACTIVA.includes(m.estado))) {
      // Quien salió del colegio (M04) no tiene una preinscripción en revisión: se le dice lo que pasó.
      if (!matriculas.some((m) => m.estado === 'PREINSCRITO') && matriculas.some((m) => m.estado === 'RETIRADO')) {
        return 'Tu matrícula fue retirada o trasladada, así que ya no tienes acceso a las actividades y notas del aula. Pide tus documentos en secretaría.';
      }
      return 'Tu preinscripción está en revisión y aún no ha sido formalizada por secretaría. Puedes consultar el estado en la página pública.';
    }
  }

  // El acudiente entra cuando la matrícula de alguno de sus hijos está confirmada (condicional o definitiva), no antes: mientras solo hay preinscripciones, la
  // familia consulta el estado y sube los documentos desde la página pública. Un acudiente sin hijos vinculados (aún) no se bloquea. Qué ve de cada hijo lo decide
  // el estado de su matrícula (portalAcudiente.service).
  if (rol === ROLES.ACUDIENTE) {
    const guardian = await Guardian.findOne({ user_id: user._id, estado: { $ne: 'inactivo' } }).select('_id');
    const hijos = guardian ? (await StudentGuardian.find({ guardian_id: guardian._id }).select('student_id')).map((v) => v.student_id) : [];
    if (hijos.length > 0) {
      const matriculas = await Enrollment.find({ student_id: { $in: hijos } }).select('estado folio_matricula');
      // Un retirado ya fue formalizado (tiene folio): su familia conserva el acceso a los documentos que le entrega el colegio.
      const confirmada = matriculas.some((m) => ESTADOS_MATRICULA_ACTIVA.includes(m.estado) || (m.estado === 'RETIRADO' && Boolean(m.folio_matricula)));
      if (!confirmada) return 'La matrícula de tu hijo o hija aún no está confirmada. Cuando el colegio la confirme podrás entrar; mientras tanto consulta el estado de la preinscripción en la página pública.';
    }
  }

  return null;
}

/** Perfiles con los que la persona puede entrar hoy, conservando el orden de `user.roles`. Si ninguno, lanza el motivo del primero. */
export async function perfilesDisponibles(user: UserDocument): Promise<Rol[]> {
  const disponibles: Rol[] = [];
  let primerMotivo: string | null = null;
  for (const rol of user.roles) {
    const motivo = await motivoSinAccesoAlPerfil(user, rol);
    if (motivo === null) disponibles.push(rol);
    else primerMotivo ??= motivo;
  }
  if (disponibles.length === 0) throw new ApiError(403, primerMotivo ?? 'Tu usuario no tiene ningún perfil habilitado.');
  return disponibles;
}
