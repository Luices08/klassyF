import { ParamsDictionary } from 'express-serve-static-core';
import { EstadoArea, NivelEducativo, TipoAsignatura } from '../constants/enums';
import Subject from '../models/subject.model';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

interface CreateSubjectBody {
  area_id: string;
  nombre: string;
  abreviatura: string;
  descripcion: string;
  tipo: TipoAsignatura;
  niveles_educativos: NivelEducativo[];
  estado?: EstadoArea;
}

export const createSubject = catchAsync<unknown, unknown, CreateSubjectBody>(async (req, res) => {
  const subject = await Subject.create(req.body);
  res.status(201).json({ success: true, data: subject });
});

interface ListSubjectsQuery {
  area_id?: string;
  estado?: EstadoArea;
  nivel_educativo?: NivelEducativo;
}

export const listSubjects = catchAsync<unknown, unknown, unknown, ListSubjectsQuery>(async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (req.query.area_id) filter.area_id = req.query.area_id;
  if (req.query.estado) filter.estado = req.query.estado;
  // Filtro usado por Gestion de Planes de Estudio: solo las asignaturas
  // habilitadas para el nivel educativo del grado que se este configurando.
  if (req.query.nivel_educativo) filter.niveles_educativos = req.query.nivel_educativo;

  const subjects = await Subject.find(filter).sort({ nombre: 1 });
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

// Edita los datos del catalogo. Cambiar el tipo (Obligatoria/Optativa) con el
// plan de estudios ya vigente exige nueva version (ver Gestion de Planes de
// Estudio) — esa validacion vive en ese servicio, no aqui.
export const actualizarSubject = catchAsync<SubjectParams, unknown, ActualizarSubjectBody>(async (req, res) => {
  const subject = await Subject.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!subject) throw new ApiError(404, 'Asignatura no encontrada.');

  res.status(200).json({ success: true, data: subject });
});

interface ActualizarEstadoSubjectBody {
  estado: EstadoArea;
}

export const actualizarEstadoSubject = catchAsync<SubjectParams, unknown, ActualizarEstadoSubjectBody>(
  async (req, res) => {
    const subject = await Subject.findByIdAndUpdate(
      req.params.id,
      { estado: req.body.estado },
      { new: true, runValidators: true }
    );
    if (!subject) throw new ApiError(404, 'Asignatura no encontrada.');

    res.status(200).json({ success: true, data: subject });
  }
);
