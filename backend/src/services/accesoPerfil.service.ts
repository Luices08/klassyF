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
 * hijo sigue preinscrito entra como DOCENTE sin problema; solo el perfil de acudiente queda cerrado.
 */
export async function motivoSinAccesoAlPerfil(user: UserDocument, rol: Rol): Promise<string | null> {
  // Preinscritos no tienen acceso al portal interno: primero la secretaría formaliza la matrícula.
  if (rol === ROLES.ESTUDIANTE) {
    const matriculas = await Enrollment.find({ student_id: user._id });
    if (matriculas.length > 0 && !matriculas.some((m) => ESTADOS_MATRICULA_ACTIVA.includes(m.estado))) {
      return 'Tu preinscripción está en revisión y aún no ha sido formalizada por secretaría. Puedes consultar el estado en la página pública.';
    }
  }

  if (rol === ROLES.ACUDIENTE) {
    const guardian = await Guardian.findOne({ user_id: user._id });
    if (guardian) {
      const vinculos = await StudentGuardian.find({ guardian_id: guardian._id });
      const studentIds = vinculos.map((v) => v.student_id);
      if (studentIds.length > 0) {
        const matriculas = await Enrollment.find({ student_id: { $in: studentIds } });
        if (matriculas.length > 0 && !matriculas.some((m) => ESTADOS_MATRICULA_ACTIVA.includes(m.estado))) {
          return 'La preinscripción de tu aspirante aún no ha sido formalizada por secretaría. Puedes consultar el estado en la página pública.';
        }
      }
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
