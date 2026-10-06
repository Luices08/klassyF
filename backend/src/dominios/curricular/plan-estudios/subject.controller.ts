import { ParamsDictionary } from 'express-serve-static-core';
import { EstadoArea, NivelEducativo, TipoAsignatura } from '../../../constants/enums';
import * as subjectService from './subject.service';
import ApiError from '../../../utils/ApiError';
import catchAsync from '../../../utils/catchAsync';

interface CreateSubjectBody {
  area_id: string;
  nombre: string;
  abreviatura: string;
  descripcion: string;
  tipo: TipoAsignatura;
  niveles_educativos: NivelEducativo[];
}

export const createSubject = catchAsync<unknown, unknown, CreateSubjectBody>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'Usuario no autenticado.');
  const subject = await subjectService.crearSubject(req.body, { usuarioId: req.user._id, ip: req.ip ?? null });
  res.status(201).json({ success: true, data: subject });
});

interface ListSubjectsQuery {
  area_id?: string;
  estado?: EstadoArea;
  nivel_educativo?: NivelEducativo;
}

export const listSubjects = catchAsync<unknown, unknown, unknown, ListSubjectsQuery>(async (req, res) => {
  const subjects = await subjectService.listarSubjects(req.query);
  res.status(200).json({ success: true, count: subjects.length, data: subjects });
});

interface SubjectParams extends ParamsDictionary {
  id: string;
}

interface ActualizarSubjectBody {
  area_id?: string;
  nombre?: string;
  abreviatura?: string;
  descripcion?: string;
  tipo?: TipoAsignatura;
  niveles_educativos?: NivelEducativo[];
}

// Edita los datos del catalogo. Reubicar de area (area_id) con la asignatura ya
// en el plan de estudios de un año activado/cerrado se bloquea en el servicio
// (reescribiria boletines ya calculados).
export const actualizarSubject = catchAsync<SubjectParams, unknown, ActualizarSubjectBody>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'Usuario no autenticado.');
  const subject = await subjectService.actualizarSubject(req.params.id, req.body, {
    usuarioId: req.user._id,
    ip: req.ip ?? null,
  });
  res.status(200).json({ success: true, data: subject });
});

interface ActualizarEstadoSubjectBody {
  estado: EstadoArea;
}

export const actualizarEstadoSubject = catchAsync<SubjectParams, unknown, ActualizarEstadoSubjectBody>(
  async (req, res) => {
    if (!req.user) throw new ApiError(401, 'Usuario no autenticado.');
    const subject = await subjectService.actualizarEstadoSubject(req.params.id, req.body.estado, {
      usuarioId: req.user._id,
      ip: req.ip ?? null,
    });
    res.status(200).json({ success: true, data: subject });
  }
);
