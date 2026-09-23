import * as studyPlanService from '../services/studyPlan.service';
import { SetStudyPlanInput } from '../services/studyPlan.service';
import catchAsync from '../utils/catchAsync';

export const setStudyPlan = catchAsync<unknown, unknown, SetStudyPlanInput>(async (req, res) => {
  const asignaciones = await studyPlanService.setStudyPlan(req.body);
  res.status(201).json({ success: true, count: asignaciones.length, data: asignaciones });
});
