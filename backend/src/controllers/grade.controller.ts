import { ParamsDictionary } from 'express-serve-static-core';
import { EstadoUsuario } from '../constants/enums';
import Grade from '../models/grade.model';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';
import { filtroPorEstado } from '../utils/filtroEstado';

interface ListGradesQuery {
  estado?: EstadoUsuario;
}

// Catalogo pequeño y global (Transicion a Once, ver scripts/seed.ts).
export const listGrades = catchAsync<unknown, unknown, unknown, ListGradesQuery>(async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (req.query.estado) filter.estado = filtroPorEstado(req.query.estado);

  const grades = await Grade.find(filter).sort({ numero: 1 });
  res.status(200).json({ success: true, count: grades.length, data: grades });
});

interface GradeParams extends ParamsDictionary {
  id: string;
}

interface ActualizarEstadoBody {
  estado: EstadoUsuario;
}

// Activa/desactiva un grado segun la oferta academica del colegio (ej. una
// institucion que no llega a media desactiva 10/11 en vez de borrar el catalogo).
export const actualizarEstado = catchAsync<GradeParams, unknown, ActualizarEstadoBody>(async (req, res) => {
  const grade = await Grade.findByIdAndUpdate(
    req.params.id,
    { estado: req.body.estado },
    { new: true, runValidators: true }
  );
  if (!grade) throw new ApiError(404, 'Grado no encontrado.');

  res.status(200).json({ success: true, data: grade });
});
