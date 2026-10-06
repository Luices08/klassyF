import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import * as teacherAssignmentService from './teacherAssignment.service';
import {
  CreateTeacherAssignmentInput,
  ListAssignmentsQuery,
} from './teacherAssignment.service';
import ApiError from '../../../utils/ApiError';
import catchAsync from '../../../utils/catchAsync';

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

interface ResumenQuery extends ParsedQs {
  academic_year_id: string;
}

export const getDocentesResumen = catchAsync<unknown, unknown, unknown, ResumenQuery>(
  async (req, res) => {
    const resumen = await teacherAssignmentService.getDocentesCargaResumen(req.query.academic_year_id);
    res.status(200).json({ success: true, count: resumen.length, data: resumen });
  }
);

interface MyLoadQuery extends ParsedQs {
  academic_year_id?: string;
}

export const myLoad = catchAsync<unknown, unknown, unknown, MyLoadQuery>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'No autenticado.');

  const assignments = await teacherAssignmentService.getMyLoad(req.user._id, req.query.academic_year_id);
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
