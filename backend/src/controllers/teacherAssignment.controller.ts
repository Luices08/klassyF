import TeacherAssignment from '../models/teacherAssignment.model';
import * as teacherAssignmentService from '../services/teacherAssignment.service';
import { CreateTeacherAssignmentInput } from '../services/teacherAssignment.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

export const createTeacherAssignment = catchAsync<unknown, unknown, CreateTeacherAssignmentInput>(
  async (req, res) => {
    const assignment = await teacherAssignmentService.createTeacherAssignment(req.body);
    res.status(201).json({ success: true, data: assignment });
  }
);

export const myLoad = catchAsync(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'No autenticado.');

  const assignments = await TeacherAssignment.find({ docente_id: req.user._id })
    .populate('group_id', 'nomenclatura jornada cupo_maximo')
    .populate('subject_id', 'nombre intensidad_horaria_semanal')
    .populate('academic_year_id', 'year calendario')
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, count: assignments.length, data: assignments });
});
