import { ParamsDictionary } from 'express-serve-static-core';
import { GrupoSanguineo } from '../constants/enums';
import { ROLES } from '../constants/roles';
import User from '../models/user.model';
import StudentProfile from '../models/studentProfile.model';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

interface UserIdParams extends ParamsDictionary {
  userId: string;
}

interface UpsertProfileBody {
  acudiente_id?: string | null;
  fecha_nacimiento: string | Date;
  eps?: string;
  rh?: GrupoSanguineo;
  estrato?: number;
  direccion_residencia?: string;
}

export const upsertProfile = catchAsync<UserIdParams, unknown, UpsertProfileBody>(async (req, res) => {
  const { userId } = req.params;

  const student = await User.findOne({ _id: userId, rol: ROLES.ESTUDIANTE });
  if (!student) {
    throw new ApiError(404, 'El usuario no existe o no tiene rol ESTUDIANTE.');
  }

  const profile = await StudentProfile.findOneAndUpdate(
    { user_id: userId },
    { $set: { ...req.body, user_id: userId } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({ success: true, data: profile });
});

export const getProfile = catchAsync<UserIdParams>(async (req, res) => {
  const { userId } = req.params;

  const profile = await StudentProfile.findOne({ user_id: userId }).populate(
    'acudiente_id',
    'nombre apellido email'
  );

  if (!profile) {
    throw new ApiError(404, 'El estudiante aun no tiene hoja de vida registrada.');
  }

  res.status(200).json({ success: true, data: profile });
});
