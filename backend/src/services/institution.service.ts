import { Types } from 'mongoose';
import { ROLES } from '../constants/roles';
import { Calendario, EstadoPeriodo } from '../constants/enums';
import AcademicYear, { AcademicYearDocument } from '../models/academicYear.model';
import Campus, { CampusDocument } from '../models/campus.model';
import Institution, { InstitutionDocument } from '../models/institution.model';
import User from '../models/user.model';
import ApiError from '../utils/ApiError';
import { runTransaction } from '../utils/runTransaction';

export interface SetupInstitutionInput {
  institucion: {
    nombre: string;
    codigo_dane: string;
    nit: string;
    resolucion_aprobacion: string;
    rector_id?: string | Types.ObjectId;
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
  if (institucion.rector_id) {
    const rector = await User.findById(institucion.rector_id);
    if (!rector) throw new ApiError(404, 'rector_id no corresponde a un usuario existente.');
    if (rector.rol !== ROLES.RECTOR) {
      throw new ApiError(400, 'El usuario referenciado en rector_id no tiene rol RECTOR.');
    }
  }

  return runTransaction(async (session) => {
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
