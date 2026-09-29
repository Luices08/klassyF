import { ParsedQs } from 'qs';
import * as studyPlanService from '../services/studyPlan.service';
import {
  ConfigurarAsignaturasGradoInput,
  ConfigurarAsignaturasMultiplesGradosInput,
  ConfigurarDistribucionGrupoInput,
  ConfigurarEvaluacionAreaInput,
  CrearPlanDesdeAnioAnteriorInput,
} from '../services/studyPlan.service';
import catchAsync from '../utils/catchAsync';

interface ObtenerStudyPlanQuery extends ParsedQs {
  institucion_id: string;
  academic_year_id: string;
}

export const configurarAsignaturasGrado = catchAsync<unknown, unknown, ConfigurarAsignaturasGradoInput>(
  async (req, res) => {
    const plan = await studyPlanService.configurarAsignaturasGrado(req.body);
    res.status(200).json({ success: true, data: plan });
  }
);

export const configurarAsignaturasMultiplesGrados = catchAsync<unknown, unknown, ConfigurarAsignaturasMultiplesGradosInput>(
  async (req, res) => {
    const plan = await studyPlanService.configurarAsignaturasMultiplesGrados(req.body);
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

export const crearPlanDesdeAnioAnterior = catchAsync<unknown, unknown, CrearPlanDesdeAnioAnteriorInput>(
  async (req, res) => {
    const plan = await studyPlanService.crearPlanDesdeAnioAnterior(req.body);
    res.status(201).json({ success: true, data: plan });
  }
);

export const obtenerStudyPlan = catchAsync<unknown, unknown, unknown, ObtenerStudyPlanQuery>(async (req, res) => {
  const plan = await studyPlanService.obtenerStudyPlan(req.query);
  res.status(200).json({ success: true, data: plan });
});
