import { Types } from 'mongoose';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import AcademicYear from '../models/academicYear.model';
import Enrollment from '../models/enrollment.model';
import Group from '../models/group.model';
import PublicacionBoletin, { PublicacionBoletinDocument } from '../models/publicacionBoletin.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { accesoFamilia, OrigenAccesoBoletin, PublicacionPlana } from '../utils/publicacionBoletin';
import { registrarEvento } from './audit.service';

export interface ReferenciaPublicacion {
  group_id: string;
  academic_year_id: string;
  periodo_numero: number;
}

export interface EstudiantePublicacion {
  student_id: string;
  nombre_completo: string;
  documento: string;
  /** Si su familia ve hoy el boletín, y por qué: lo decidió el grupo, una excepción suya, o aún no se publica. */
  visible: boolean;
  origen: OrigenAccesoBoletin;
}

export interface PublicacionVista {
  publicado: boolean;
  publicado_at: Date | null;
  estudiantes: EstudiantePublicacion[];
}

const aPlana = (publicacion: PublicacionBoletinDocument | null): PublicacionPlana | null =>
  publicacion && {
    publicado: publicacion.publicado,
    excepciones: publicacion.excepciones.map((e) => ({ student_id: String(e.student_id), permitir: e.permitir })),
  };

const filtroDe = (ref: ReferenciaPublicacion) => ({
  group_id: ref.group_id,
  academic_year_id: ref.academic_year_id,
  periodo_numero: ref.periodo_numero,
});

/** El grupo debe ser de ese año y el periodo existir en él: una publicación huérfana nunca debe poder crearse. */
async function validarReferencia(ref: ReferenciaPublicacion): Promise<void> {
  const [anio, grupo] = await Promise.all([AcademicYear.findById(ref.academic_year_id).select('periodos year'), Group.findById(ref.group_id).select('academic_year_id')]);
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  if (!grupo) throw new ApiError(404, 'Grupo no encontrado.');
  if (String(grupo.academic_year_id) !== String(anio._id)) throw new ApiError(400, 'El grupo no pertenece a ese año lectivo.');
  if (!anio.periodos.some((p) => p.numero === ref.periodo_numero)) throw new ApiError(400, `El año ${anio.year} no tiene un periodo ${ref.periodo_numero}.`);
}

async function estudiantesDelGrupo(ref: ReferenciaPublicacion): Promise<UserDocument[]> {
  const matriculas = await Enrollment.find({ group_id: ref.group_id, academic_year_id: ref.academic_year_id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } }).select('student_id');
  return User.find({ _id: { $in: matriculas.map((m) => m.student_id) } }).sort({ apellido: 1, nombre: 1 });
}

export async function obtenerPublicacion(ref: ReferenciaPublicacion): Promise<PublicacionVista> {
  await validarReferencia(ref);
  const [publicacion, estudiantes] = await Promise.all([PublicacionBoletin.findOne(filtroDe(ref)), estudiantesDelGrupo(ref)]);
  const plana = aPlana(publicacion);
  return {
    publicado: publicacion?.publicado ?? false,
    publicado_at: publicacion?.publicado_at ?? null,
    estudiantes: estudiantes.map((e) => ({
      student_id: String(e._id),
      nombre_completo: `${e.apellido} ${e.nombre}`,
      documento: e.numero_documento,
      ...accesoFamilia(plana, String(e._id)),
    })),
  };
}

/** Publica o retira el boletín de un grupo para las familias. No toca las excepciones por estudiante. */
export async function establecerPublicacionGrupo(
  ref: ReferenciaPublicacion,
  publicado: boolean,
  usuario: UserDocument,
  ip?: string | null
): Promise<PublicacionVista> {
  await validarReferencia(ref);
  await PublicacionBoletin.updateOne(
    filtroDe(ref),
    { $set: { publicado, publicado_por: usuario._id, publicado_at: publicado ? new Date() : null } },
    { upsert: true }
  );
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'BOLETIN_PUBLICACION_ACTUALIZADA',
    entidad: 'Group',
    entidad_id: ref.group_id,
    detalle: `periodo ${ref.periodo_numero}: ${publicado ? 'publicado' : 'retirado'}`,
    ip,
  });
  return obtenerPublicacion(ref);
}

/**
 * Deja a un estudiante (y a sus acudientes) con acceso permitido o bloqueado sin importar lo que decidió el grupo.
 * `permitir: null` quita la excepción y vuelve a valer lo del grupo.
 */
export async function establecerAccesoEstudiante(
  ref: ReferenciaPublicacion,
  studentId: string,
  permitir: boolean | null,
  usuario: UserDocument,
  ip?: string | null
): Promise<PublicacionVista> {
  await validarReferencia(ref);
  const estudiantes = await estudiantesDelGrupo(ref);
  if (!estudiantes.some((e) => String(e._id) === studentId)) {
    throw new ApiError(400, 'El estudiante no tiene matrícula activa en este grupo.');
  }

  // Se crea la publicación (sin publicar) si no existe, y se reemplaza la excepción de ese estudiante en una sola escritura.
  await PublicacionBoletin.updateOne(filtroDe(ref), { $setOnInsert: { publicado: false } }, { upsert: true });
  await PublicacionBoletin.updateOne(filtroDe(ref), { $pull: { excepciones: { student_id: new Types.ObjectId(studentId) } } });
  if (permitir !== null) {
    await PublicacionBoletin.updateOne(filtroDe(ref), {
      $push: { excepciones: { student_id: new Types.ObjectId(studentId), permitir, por: usuario._id, fecha: new Date() } },
    });
  }

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'BOLETIN_ACCESO_ESTUDIANTE_ACTUALIZADO',
    entidad: 'User',
    entidad_id: studentId,
    detalle: `periodo ${ref.periodo_numero}: ${permitir === null ? 'excepción retirada' : permitir ? 'permitido' : 'bloqueado'}`,
    ip,
  });
  return obtenerPublicacion(ref);
}

/** Lo que se exige a un estudiante o a su acudiente antes de mostrarles el boletín. El personal del colegio no pasa por aquí. */
export async function exigirBoletinDisponible(ref: ReferenciaPublicacion, studentId: string): Promise<void> {
  const publicacion = await PublicacionBoletin.findOne(filtroDe(ref));
  if (!accesoFamilia(aPlana(publicacion), studentId).visible) {
    throw new ApiError(403, 'El boletín de este periodo aún no está disponible para consulta. Comunícate con el colegio.');
  }
}
