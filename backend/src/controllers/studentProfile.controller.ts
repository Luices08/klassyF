import { ParamsDictionary } from 'express-serve-static-core';
import {
  EstadoEstudiante,
  Genero,
  GrupoEtnico,
  GrupoSanguineo,
  RegimenSalud,
} from '../constants/enums';
import { ROLES } from '../constants/roles';
import User from '../models/user.model';
import StudentProfile from '../models/studentProfile.model';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

interface UserIdParams extends ParamsDictionary {
  userId: string;
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
}

async function obtenerEstudiante(userId: string) {
  const student = await User.findOne({ _id: userId, rol: ROLES.ESTUDIANTE });
  if (!student) throw new ApiError(404, 'El usuario no existe o no tiene rol ESTUDIANTE.');
  return student;
}

export const upsertProfile = catchAsync<UserIdParams, unknown, UpsertProfileBody>(async (req, res) => {
  await obtenerEstudiante(req.params.userId);

  const profile = await StudentProfile.findOneAndUpdate(
    { user_id: req.params.userId },
    { $set: { ...req.body, user_id: req.params.userId } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({ success: true, data: profile });
});

export const getProfile = catchAsync<UserIdParams>(async (req, res) => {
  const profile = await StudentProfile.findOne({ user_id: req.params.userId });

  if (!profile) {
    throw new ApiError(404, 'El estudiante aun no tiene hoja de vida registrada.');
  }

  res.status(200).json({ success: true, data: profile });
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
