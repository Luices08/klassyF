import { ParamsDictionary } from 'express-serve-static-core';
import Activity from '../models/activity.model';
import * as activityService from '../services/activity.service';
import { CreateActivityInput, CreateSubmissionInput, GradeEntryInput } from '../services/activity.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

export const createActivity = catchAsync<unknown, unknown, CreateActivityInput>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'No autenticado.');

  const activity = await activityService.createActivity(req.body, req.user);
  res.status(201).json({ success: true, data: activity });
});

interface ListActivitiesQuery {
  teacher_assignment_id?: string;
  periodo?: number;
}

export const listActivities = catchAsync<unknown, unknown, unknown, ListActivitiesQuery>(async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (req.query.teacher_assignment_id) filter.teacher_assignment_id = req.query.teacher_assignment_id;
  if (req.query.periodo) filter.periodo_numero = req.query.periodo;

  const activities = await Activity.find(filter).sort({ fecha_apertura: 1 });
  res.status(200).json({ success: true, count: activities.length, data: activities });
});

interface ActivityIdParams extends ParamsDictionary {
  id: string;
}

export const createSubmission = catchAsync<ActivityIdParams, unknown, CreateSubmissionInput>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'No autenticado.');

  const submission = await activityService.createSubmission(req.params.id, req.body, req.user);
  res.status(201).json({ success: true, data: submission });
});

export const gradeActivity = catchAsync<ActivityIdParams, unknown, GradeEntryInput | GradeEntryInput[]>(
  async (req, res) => {
    if (!req.user) throw new ApiError(401, 'No autenticado.');

    const entries = Array.isArray(req.body) ? req.body : [req.body];
    const submissions = await activityService.gradeActivity(req.params.id, entries, req.user);
    res.status(200).json({ success: true, count: submissions.length, data: submissions });
  }
);
