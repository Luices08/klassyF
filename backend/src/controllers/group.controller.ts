import { ParamsDictionary } from 'express-serve-static-core';
import { EstadoGrupo } from '../constants/enums';
import Group from '../models/group.model';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

interface CreateGroupBody {
  sede_id: string;
  academic_year_id: string;
  grade_id: string;
  jornada_id: string;
  nomenclatura: string;
  max_capacity: number;
  director_grupo_id?: string | null;
}

export const createGroup = catchAsync<unknown, unknown, CreateGroupBody>(async (req, res) => {
  const group = await Group.create(req.body);
  res.status(201).json({ success: true, data: group });
});

interface ListGroupsQuery {
  academic_year_id?: string;
  sede_id?: string;
  grade_id?: string;
  jornada_id?: string;
  estado?: EstadoGrupo;
}

const FILTER_KEYS: Array<keyof ListGroupsQuery> = [
  'academic_year_id',
  'sede_id',
  'grade_id',
  'jornada_id',
  'estado',
];

export const listGroups = catchAsync<unknown, unknown, unknown, ListGroupsQuery>(async (req, res) => {
  const filter: Record<string, string> = {};
  FILTER_KEYS.forEach((key) => {
    const value = req.query[key];
    if (value) filter[key] = value;
  });

  const groups = await Group.find(filter)
    .populate('grade_id', 'nivel numero nombre')
    .populate('sede_id', 'nombre')
    .populate('jornada_id', 'nombre')
    .populate('director_grupo_id', 'nombre apellido')
    .sort({ nomenclatura: 1 });

  res.status(200).json({ success: true, count: groups.length, data: groups });
});

interface ActualizarEstadoParams extends ParamsDictionary {
  groupId: string;
}

interface ActualizarEstadoBody {
  estado: EstadoGrupo;
}

// Cierra o reactiva un grupo (ACTIVE/CLOSED). No borra el grupo ni sus
// matriculas: solo marca si sigue operativo para el año lectivo.
export const actualizarEstadoGrupo = catchAsync<ActualizarEstadoParams, unknown, ActualizarEstadoBody>(
  async (req, res) => {
    const group = await Group.findByIdAndUpdate(
      req.params.groupId,
      { estado: req.body.estado },
      { new: true, runValidators: true }
    );
    if (!group) throw new ApiError(404, 'Grupo no encontrado.');

    res.status(200).json({ success: true, data: group });
  }
);
