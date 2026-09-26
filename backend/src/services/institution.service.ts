import { Types } from 'mongoose';
import { ROLES } from '../constants/roles';
import { Calendario, EstadoPeriodo, EstadoUsuario } from '../constants/enums';
import AcademicYear, { AcademicYearDocument } from '../models/academicYear.model';
import Campus, { CampusDocument } from '../models/campus.model';
import Institution, { InstitutionDocument } from '../models/institution.model';
import User from '../models/user.model';
import ApiError from '../utils/ApiError';
import { runTransaction } from '../utils/runTransaction';

export interface UpdateInstitutionInput {
  nombre: string;
  codigo_dane: string;
  nit: string;
  resolucion_aprobacion: string;
  estado?: EstadoUsuario;
  logo_url?: string | null;
}

export interface SetupInstitutionInput {
  institucion: {
    nombre: string;
    codigo_dane: string;
    nit: string;
    resolucion_aprobacion: string;
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
      estado?: EstadoPeriodo;
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
          periodos: anio_lectivo.periodos.map((p) => ({ ...p, estado: 'CERRADO' })),
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
  await institucion.save();

  return institucion;
}
