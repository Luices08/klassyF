import { ParamsDictionary } from 'express-serve-static-core';
import { Types } from 'mongoose';
import {
  EstadoEstudiante,
  Genero,
  GrupoEtnico,
  GrupoSanguineo,
  RegimenSalud,
} from '../../../constants/enums';
import { ROLES } from '../../../constants/roles';
import User from '../../../models/user.model';
import StudentProfile from './studentProfile.model';
import ApiError from '../../../utils/ApiError';
import catchAsync from '../../../utils/catchAsync';
import { ocultarSaludAdministrativa } from './datosSensibles';

interface UserIdParams extends ParamsDictionary {
  userId: string;
}

interface AutorizacionDatosSensiblesBody {
  otorgada: boolean;
  otorgado_por_nombre?: string | null;
}

interface UpsertProfileBody {
  lugar_expedicion?: string;
  fecha_nacimiento: string | Date;
  genero?: Genero;
  eps?: string;
  regimen_salud?: RegimenSalud;
  rh?: GrupoSanguineo;
  alergias_condiciones?: string;
  direccion_residencia?: string;
  barrio_vereda?: string;
  municipio?: string;
  estrato?: number;
  grupo_etnico?: GrupoEtnico;
  victima_conflicto?: boolean;
  tiene_discapacidad?: boolean;
  tiene_talento_excepcional?: boolean;
  descripcion_inclusion?: string;
  institucion_procedencia?: string;
  autorizacion_datos_sensibles?: AutorizacionDatosSensiblesBody;
}

async function obtenerEstudiante(userId: string) {
  const student = await User.findOne({ _id: userId, rol: ROLES.ESTUDIANTE });
  if (!student) throw new ApiError(404, 'El usuario no existe o no tiene rol ESTUDIANTE.');
  return student;
}

export const upsertProfile = catchAsync<UserIdParams, unknown, UpsertProfileBody>(async (req, res) => {
  await obtenerEstudiante(req.params.userId);

  const { autorizacion_datos_sensibles, ...resto } = req.body;

  let profile = await StudentProfile.findOne({ user_id: req.params.userId });
  if (!profile) profile = new StudentProfile({ user_id: req.params.userId });

  profile.set(resto);

  // fecha y registrado_por_id son trazabilidad del sistema: nunca se toman del
  // cliente, para que la autorizacion quede firmada por quien la registra de
  // verdad (req.user), no por cualquiera que arme el payload.
  if (autorizacion_datos_sensibles) {
    const otorgada = Boolean(autorizacion_datos_sensibles.otorgada);
    profile.autorizacion_datos_sensibles = {
      otorgada,
      otorgado_por_nombre: autorizacion_datos_sensibles.otorgado_por_nombre || null,
      fecha: otorgada ? new Date() : (profile.autorizacion_datos_sensibles?.fecha ?? null),
      registrado_por_id: otorgada
        ? (req.user!._id as Types.ObjectId)
        : (profile.autorizacion_datos_sensibles?.registrado_por_id ?? null),
    };
  }

  await profile.save();

  res.status(200).json({ success: true, data: profile });
});

export const getProfile = catchAsync<UserIdParams>(async (req, res) => {
  const profile = await StudentProfile.findOne({ user_id: req.params.userId });

  if (!profile) {
    throw new ApiError(404, 'El estudiante aun no tiene hoja de vida registrada.');
  }

  const data = ocultarSaludAdministrativa(profile.toObject(), req.user!.rol);
  res.status(200).json({ success: true, data });
});

interface ActualizarEstadoBody {
  estado: EstadoEstudiante;
}

export const actualizarEstadoPerfil = catchAsync<UserIdParams, unknown, ActualizarEstadoBody>(async (req, res) => {
  const profile = await StudentProfile.findOne({ user_id: req.params.userId });
  if (!profile) throw new ApiError(404, 'El estudiante aun no tiene hoja de vida registrada.');

  profile.estado = req.body.estado;
  await profile.save();

  res.status(200).json({ success: true, data: profile });
});
