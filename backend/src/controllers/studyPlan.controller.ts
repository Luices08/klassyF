import * as studyPlanService from '../services/studyPlan.service';
import {
  ConfigurarAsignaturasGradoInput,
  ConfigurarDistribucionGrupoInput,
  ConfigurarEvaluacionAreaInput,
  ObtenerStudyPlanInput,
} from '../services/studyPlan.service';
import catchAsync from '../utils/catchAsync';

export const configurarAsignaturasGrado = catchAsync<unknown, unknown, ConfigurarAsignaturasGradoInput>(
  async (req, res) => {
    const plan = await studyPlanService.configurarAsignaturasGrado(req.body);
    res.status(200).json({ success: true, data: plan });
  }
);

export const configurarEvaluacionArea = catchAsync<unknown, unknown, ConfigurarEvaluacionAreaInput>(
  async (req, res) => {
    const plan = await studyPlanService.configurarEvaluacionArea(req.body);
    res.status(200).json({ success: true, data: plan });
  }
);

export const configurarDistribucionGrupo = catchAsync<unknown, unknown, ConfigurarDistribucionGrupoInput>(
  async (req, res) => {
    const plan = await studyPlanService.configurarDistribucionGrupo(req.body);
    res.status(200).json({ success: true, data: plan });
  }
);

export const obtenerStudyPlan = catchAsync<unknown, unknown, unknown, ObtenerStudyPlanInput>(async (req, res) => {
  const plan = await studyPlanService.obtenerStudyPlan(req.query);
  res.status(200).json({ success: true, data: plan });
});
