import { ParsedQs } from 'qs';
import Attendance from '../models/attendance.model';
import * as attendanceService from '../services/attendance.service';
import { RegisterAttendanceInput } from '../services/attendance.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

export const registerAttendance = catchAsync<unknown, unknown, RegisterAttendanceInput>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'No autenticado.');

  const attendance = await attendanceService.registerAttendance(req.body, req.user);
  res.status(201).json({ success: true, data: attendance });
});

interface ListAttendanceQuery extends ParsedQs {
  group_id: string;
  subject_id: string;
  fecha: string;
}

export const listAttendance = catchAsync<unknown, unknown, unknown, ListAttendanceQuery>(async (req, res) => {
  const fecha = new Date(req.query.fecha);
  fecha.setUTCHours(0, 0, 0, 0);

  const attendance = await Attendance.findOne({
    group_id: req.query.group_id,
    subject_id: req.query.subject_id,
    fecha,
  });

  res.status(200).json({ success: true, data: attendance });
});
