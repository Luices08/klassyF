import { ParamsDictionary } from 'express-serve-static-core';
import { EstadoGrupo } from '../constants/enums';
import Group from '../models/group.model';
import { asegurarAnioNoCerrado } from '../services/academicYear.service';
import { registrarEvento } from '../services/audit.service';
import { exigirEspaciosFisicos, validarAulaParaGrupo } from '../services/espacio.service';
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
  /** Salon titular (M10), opcional. */
  aula_id?: string | null;
}

export const createGroup = catchAsync<unknown, unknown, CreateGroupBody>(async (req, res) => {
  await asegurarAnioNoCerrado(req.body.academic_year_id);

  // El aula es opcional: sin aula el grupo se crea como siempre. Con aula, se valida contra su aforo (M10).
  let advertencia: string | null = null;
  if (req.body.aula_id) {
    await exigirEspaciosFisicos();
    advertencia = (await validarAulaParaGrupo({ ...req.body, aula_id: req.body.aula_id })).advertencia;
  }

  const group = await Group.create(req.body);

  if (advertencia) {
    await registrarEvento({
      usuario_id: req.user?._id,
      accion: 'GRUPO_EXCEDE_AFORO_AULA',
      entidad: 'Group',
      entidad_id: group._id,
      detalle: advertencia,
      ip: req.ip,
    });
  }
  res.status(201).json({ success: true, data: group, advertencia });
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
    .populate('jornada_id', 'nombre hora_inicio hora_fin')
    .populate('aula_id', 'nombre capacidad')
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
    // Reactivar un grupo cuya aula ya no esta libre (otro grupo la tomo en su jornada) dejaria dos grupos en un salon.
    const existente = await Group.findById(req.params.groupId);
    if (!existente) throw new ApiError(404, 'Grupo no encontrado.');
    if (req.body.estado === 'ACTIVE' && existente.estado !== 'ACTIVE' && existente.aula_id) {
      await validarAulaParaGrupo({
        aula_id: existente.aula_id,
        sede_id: existente.sede_id,
        jornada_id: existente.jornada_id,
        academic_year_id: existente.academic_year_id,
        max_capacity: existente.max_capacity,
        excluir_group_id: existente._id,
      });
    }

    const group = await Group.findByIdAndUpdate(
      req.params.groupId,
      { estado: req.body.estado },
      { new: true, runValidators: true }
    );
    if (!group) throw new ApiError(404, 'Grupo no encontrado.');

    res.status(200).json({ success: true, data: group });
  }
);
