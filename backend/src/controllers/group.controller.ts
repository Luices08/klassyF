import { Jornada } from '../constants/enums';
import Group from '../models/group.model';
import catchAsync from '../utils/catchAsync';

interface CreateGroupBody {
  sede_id: string;
  academic_year_id: string;
  grade_id: string;
  jornada: Jornada;
  nomenclatura: string;
  cupo_maximo: number;
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
  jornada?: Jornada;
}

const FILTER_KEYS: Array<keyof ListGroupsQuery> = ['academic_year_id', 'sede_id', 'grade_id', 'jornada'];

export const listGroups = catchAsync<unknown, unknown, unknown, ListGroupsQuery>(async (req, res) => {
  const filter: Record<string, string> = {};
  FILTER_KEYS.forEach((key) => {
    const value = req.query[key];
    if (value) filter[key] = value;
  });

  const groups = await Group.find(filter)
    .populate('grade_id', 'nivel numero nombre')
    .populate('sede_id', 'nombre')
    .populate('director_grupo_id', 'nombre apellido')
    .sort({ nomenclatura: 1 });

  res.status(200).json({ success: true, count: groups.length, data: groups });
});
