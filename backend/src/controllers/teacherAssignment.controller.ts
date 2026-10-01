import { ParamsDictionary } from 'express-serve-static-core';
import TeacherAssignment from '../models/teacherAssignment.model';
import * as teacherAssignmentService from '../services/teacherAssignment.service';
import {
  CreateTeacherAssignmentInput,
  ListAssignmentsQuery,
} from '../services/teacherAssignment.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

export const createTeacherAssignment = catchAsync<unknown, unknown, CreateTeacherAssignmentInput>(
  async (req, res) => {
    if (!req.user) throw new ApiError(401, 'No autenticado.');
    const assignment = await teacherAssignmentService.createTeacherAssignment(req.body, {
      id: req.user._id,
      ip: req.ip,
    });
    res.status(201).json({ success: true, data: assignment });
  }
);

export const listTeacherAssignments = catchAsync<unknown, unknown, unknown, ListAssignmentsQuery>(
  async (req, res) => {
    const assignments = await teacherAssignmentService.listTeacherAssignments(req.query);
    res.status(200).json({ success: true, count: assignments.length, data: assignments });
  }
);

interface ResumenQuery {
  academic_year_id?: string;
}

export const getDocentesResumen = catchAsync<unknown, unknown, unknown, ResumenQuery>(
  async (req, res) => {
    if (!req.query.academic_year_id) {
      throw new ApiError(400, 'Se requiere academic_year_id para consultar el resumen de carga.');
    }
    const resumen = await teacherAssignmentService.getDocentesCargaResumen(req.query.academic_year_id);
    res.status(200).json({ success: true, count: resumen.length, data: resumen });
  }
);

export const myLoad = catchAsync(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'No autenticado.');

  const assignments = await TeacherAssignment.find({ docente_id: req.user._id, estado: 'activo' })
    .populate({
      path: 'group_id',
      select: 'nomenclatura jornada_id max_capacity grade_id sede_id',
      populate: [
        { path: 'grade_id', select: 'nombre numero' },
        { path: 'sede_id', select: 'nombre' },
        { path: 'jornada_id', select: 'nombre' },
      ],
    })
    .populate({
      path: 'subject_id',
      select: 'nombre abreviatura area_id',
      populate: { path: 'area_id', select: 'nombre codigo' },
    })
    .populate('academic_year_id', 'year calendario estado')
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, count: assignments.length, data: assignments });
});

interface IdParams extends ParamsDictionary {
  id: string;
}

export const deleteTeacherAssignment = catchAsync<IdParams>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'No autenticado.');
  await teacherAssignmentService.deleteTeacherAssignment(req.params.id, { id: req.user._id, ip: req.ip });
  res.status(200).json({ success: true, message: 'Asignación académica eliminada correctamente.' });
});
