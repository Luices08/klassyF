import { Types } from 'mongoose';
import { ROLES } from '../constants/roles';
import { Calendario, EstadoUsuario, ModalidadInstitucion, PoliticaAforoAula } from '../constants/enums';
import AcademicYear, { AcademicYearDocument } from '../models/academicYear.model';
import Campus, { CampusDocument } from '../models/campus.model';
import Institution, { InstitutionDocument } from '../models/institution.model';
import User from '../models/user.model';
import ApiError from '../utils/ApiError';
import { FranjaPlantilla } from '../utils/franjas';
import { registrarEvento } from './audit.service';
import { runTransaction } from '../utils/runTransaction';

export interface UpdateInstitutionInput {
  nombre: string;
  codigo_dane: string;
  nit: string;
  resolucion_aprobacion: string;
  estado?: EstadoUsuario;
  logo_url?: string | null;
  correo_secretaria?: string | null;
  horario_atencion?: string | null;
  modalidad?: ModalidadInstitucion;
  politica_aforo_aula?: PoliticaAforoAula;
}

export interface SetupInstitutionInput {
  institucion: {
    nombre: string;
    codigo_dane: string;
    nit: string;
    resolucion_aprobacion: string;
    modalidad?: ModalidadInstitucion;
    administrador_id?: string | Types.ObjectId;
  };
  sede_principal: {
    nombre: string;
    codigo_dane_sede: string;
    direccion: string;
  };
  anio_lectivo: {
    year: number;
    calendario: Calendario;
    periodos: Array<{
      numero: number;
      nombre: string;
      porcentaje: number;
      fecha_inicio: Date | string;
      fecha_fin: Date | string;
    }>;
  };
}

export interface SetupInstitutionResult {
  institution: InstitutionDocument;
  sede_principal: CampusDocument;
  academic_year: AcademicYearDocument;
}

/**
 * Crea, en una unica transaccion, el colegio, su sede principal y el año
 * lectivo inicial con sus periodos. Si cualquier paso falla (por ejemplo la
 * validacion de que los porcentajes de periodos sumen 100), se revierte todo.
 */
export async function setupInstitution({
  institucion,
  sede_principal,
  anio_lectivo,
}: SetupInstitutionInput): Promise<SetupInstitutionResult> {
  if (institucion.administrador_id) {
    const administrador = await User.findById(institucion.administrador_id);
    if (!administrador) throw new ApiError(404, 'administrador_id no corresponde a un usuario existente.');
    if (administrador.rol !== ROLES.ADMIN) {
      throw new ApiError(400, 'El usuario referenciado en administrador_id no tiene rol ADMIN.');
    }
  }

  return runTransaction(async (session) => {
    // Cada despliegue de Klassy pertenece a una sola institucion (se vende por
    // colegio, con un dominio propio). El multitenant solo existe a nivel de
    // sedes DENTRO de esa institucion, nunca entre instituciones distintas.
    // Se verifica dentro de la misma transaccion para que sea atomico con la creacion.
    const yaHayInstitucion = await Institution.exists({}).session(session);
    if (yaHayInstitucion) {
      throw new ApiError(
        409,
        'Este sistema ya tiene una institución configurada. Usa "Modificar institución" para editarla, o el módulo de Sedes y jornadas para agregar sedes adicionales.'
      );
    }

    const [institution] = await Institution.create([institucion], { session });
    if (!institution) throw new ApiError(500, 'No se pudo crear la institucion.');

    const [campus] = await Campus.create(
      [
        {
          ...sede_principal,
          institucion_id: institution._id,
          es_principal: true,
        },
      ],
      { session }
    );
    if (!campus) throw new ApiError(500, 'No se pudo crear la sede principal.');

    const [academicYear] = await AcademicYear.create(
      [
        {
          institucion_id: institution._id,
          year: anio_lectivo.year,
          calendario: anio_lectivo.calendario,
          estado: 'PLANIFICACION',
          periodos: anio_lectivo.periodos.map((p) => ({ ...p, estado: 'PROGRAMADO' })),
        },
      ],
      { session }
    );
    if (!academicYear) throw new ApiError(500, 'No se pudo crear el año lectivo.');

    return {
      institution,
      sede_principal: campus,
      academic_year: academicYear,
    };
  });
}

/**
 * Plantilla base de franjas (clases y descansos, por duracion) que se carga en las jornadas. No lleva contraseña de
 * confirmacion: no toca datos legales de la institucion, y editarla no altera las jornadas ya configuradas.
 */
export async function actualizarPlantillaFranjas(
  franjas: FranjaPlantilla[],
  { usuarioId, ip }: { usuarioId: Types.ObjectId | string; ip?: string | null }
): Promise<InstitutionDocument> {
  const institucion = await Institution.findOne();
  if (!institucion) throw new ApiError(404, 'No hay una institución configurada todavía.');

  institucion.set('plantilla_franjas', franjas);
  await institucion.save();

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'PLANTILLA_FRANJAS_ACTUALIZADA',
    entidad: 'Institution',
    entidad_id: institucion._id,
    detalle: `${franjas.length} bloque(s), ${franjas.reduce((s, f) => s + f.duracion_min, 0)} minutos en total`,
    ip,
  });
  return institucion;
}

/** Como solo existe una institucion por despliegue, no recibe ni necesita un id. */
export async function getInstitution(): Promise<InstitutionDocument | null> {
  return Institution.findOne();
}

export async function updateInstitution(
  adminUserId: string | Types.ObjectId,
  input: UpdateInstitutionInput,
  confirmPassword: string
): Promise<InstitutionDocument> {
  const admin = await User.findById(adminUserId).select('+password_hash');
  if (!admin) throw new ApiError(401, 'Usuario no encontrado.');

  const passwordOk = await admin.comparePassword(confirmPassword);
  if (!passwordOk) throw new ApiError(401, 'Contraseña incorrecta.');

  const institucion = await Institution.findOne();
  if (!institucion) throw new ApiError(404, 'No hay una institución configurada todavía.');

  institucion.nombre = input.nombre;
  institucion.codigo_dane = input.codigo_dane;
  institucion.nit = input.nit;
  institucion.resolucion_aprobacion = input.resolucion_aprobacion;
  if (input.estado !== undefined) institucion.estado = input.estado;
  if (input.logo_url !== undefined) institucion.logo_url = input.logo_url;
  if (input.correo_secretaria !== undefined) institucion.correo_secretaria = input.correo_secretaria;
  if (input.horario_atencion !== undefined) institucion.horario_atencion = input.horario_atencion;
  if (input.modalidad !== undefined) institucion.modalidad = input.modalidad;
  if (input.politica_aforo_aula !== undefined) institucion.politica_aforo_aula = input.politica_aforo_aula;
  await institucion.save();

  return institucion;
}

export async function getLimitesCarga(): Promise<InstitutionDocument['limites_carga_docente']> {
  const institucion = await Institution.findOne();
  if (!institucion || !institucion.limites_carga_docente) {
    return { PREESCOLAR: 20, PRIMARIA: 25, SECUNDARIA: 22, MEDIA: 22 };
  }
  return institucion.limites_carga_docente;
}

export async function updateLimitesCarga(
  limites: { PREESCOLAR?: number; PRIMARIA?: number; SECUNDARIA?: number; MEDIA?: number },
  { usuarioId, ip }: { usuarioId: Types.ObjectId | string; ip?: string | null }
): Promise<InstitutionDocument['limites_carga_docente']> {
  const institucion = await Institution.findOne();
  if (!institucion) throw new ApiError(404, 'No hay una institución configurada todavía.');

  const actual = institucion.limites_carga_docente || {
    PREESCOLAR: 20,
    PRIMARIA: 25,
    SECUNDARIA: 22,
    MEDIA: 22,
  };

  institucion.limites_carga_docente = {
    PREESCOLAR: limites.PREESCOLAR ?? actual.PREESCOLAR,
    PRIMARIA: limites.PRIMARIA ?? actual.PRIMARIA,
    SECUNDARIA: limites.SECUNDARIA ?? actual.SECUNDARIA,
    MEDIA: limites.MEDIA ?? actual.MEDIA,
  };

  await institucion.save();

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'LIMITES_CARGA_DOCENTE_ACTUALIZADOS',
    entidad: 'Institution',
    entidad_id: institucion._id,
    detalle: `PREESCOLAR ${institucion.limites_carga_docente.PREESCOLAR}h, PRIMARIA ${institucion.limites_carga_docente.PRIMARIA}h, SECUNDARIA ${institucion.limites_carga_docente.SECUNDARIA}h, MEDIA ${institucion.limites_carga_docente.MEDIA}h`,
    ip,
  });
  return institucion.limites_carga_docente;
}

/** M06: tope de horas semanales del Plan de Estudios por nivel (antes quemado a 30 para todos en el frontend). */
export async function getLimitesHorasPlan(): Promise<InstitutionDocument['limites_horas_plan_estudios']> {
  const institucion = await Institution.findOne();
  if (!institucion || !institucion.limites_horas_plan_estudios) {
    return { PREESCOLAR: 30, PRIMARIA: 30, SECUNDARIA: 30, MEDIA: 30 };
  }
  return institucion.limites_horas_plan_estudios;
}

export async function updateLimitesHorasPlan(
  limites: { PREESCOLAR?: number; PRIMARIA?: number; SECUNDARIA?: number; MEDIA?: number }
): Promise<InstitutionDocument['limites_horas_plan_estudios']> {
  const institucion = await Institution.findOne();
  if (!institucion) throw new ApiError(404, 'No hay una institución configurada todavía.');

  const actual = institucion.limites_horas_plan_estudios || {
    PREESCOLAR: 30,
    PRIMARIA: 30,
    SECUNDARIA: 30,
    MEDIA: 30,
  };

  institucion.limites_horas_plan_estudios = {
    PREESCOLAR: limites.PREESCOLAR ?? actual.PREESCOLAR,
    PRIMARIA: limites.PRIMARIA ?? actual.PRIMARIA,
    SECUNDARIA: limites.SECUNDARIA ?? actual.SECUNDARIA,
    MEDIA: limites.MEDIA ?? actual.MEDIA,
  };

  await institucion.save();
  return institucion.limites_horas_plan_estudios;
}
