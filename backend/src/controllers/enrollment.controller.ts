import { ParamsDictionary } from 'express-serve-static-core';
import { EstadoMatricula } from '../constants/enums';
import * as enrollmentService from '../services/enrollment.service';
import { CreateEnrollmentInput } from '../services/enrollment.service';
import catchAsync from '../utils/catchAsync';

export const createEnrollment = catchAsync<unknown, unknown, CreateEnrollmentInput>(async (req, res) => {
  const enrollment = await enrollmentService.createEnrollment(req.body);
  res.status(201).json({ success: true, data: enrollment });
});

interface UpdateStatusParams extends ParamsDictionary {
  id: string;
}

interface UpdateStatusBody {
  estado: EstadoMatricula;
}

export const updateStatus = catchAsync<UpdateStatusParams, unknown, UpdateStatusBody>(async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;
  const enrollment = await enrollmentService.updateEnrollmentStatus(id, estado);
  res.status(200).json({ success: true, data: enrollment });
});
