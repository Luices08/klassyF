import { ParsedQs } from 'qs';
import * as studyPlanService from '../services/studyPlan.service';
import {
  ConfigurarAsignaturasGradoInput,
  ConfigurarAsignaturasMultiplesGradosInput,
  ConfigurarDistribucionGrupoInput,
  ConfigurarEvaluacionAreaInput,
  CrearPlanDesdeAnioAnteriorInput,
} from '../services/studyPlan.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

interface ObtenerStudyPlanQuery extends ParsedQs {
  institucion_id: string;
  academic_year_id: string;
}

export const configurarAsignaturasGrado = catchAsync<unknown, unknown, ConfigurarAsignaturasGradoInput>(
  async (req, res) => {
    if (!req.user) throw new ApiError(401, 'Usuario no autenticado.');
    const plan = await studyPlanService.configurarAsignaturasGrado(req.body, {
      usuarioId: req.user._id,
      ip: req.ip ?? null,
    });
    res.status(200).json({ success: true, data: plan });
  }
);

export const configurarAsignaturasMultiplesGrados = catchAsync<unknown, unknown, ConfigurarAsignaturasMultiplesGradosInput>(
  async (req, res) => {
    if (!req.user) throw new ApiError(401, 'Usuario no autenticado.');
    const plan = await studyPlanService.configurarAsignaturasMultiplesGrados(req.body, {
      usuarioId: req.user._id,
      ip: req.ip ?? null,
    });
    res.status(200).json({ success: true, data: plan });
  }
);

export const configurarEvaluacionArea = catchAsync<unknown, unknown, ConfigurarEvaluacionAreaInput>(
  async (req, res) => {
    if (!req.user) throw new ApiError(401, 'Usuario no autenticado.');
    const plan = await studyPlanService.configurarEvaluacionArea(req.body, {
      usuarioId: req.user._id,
      ip: req.ip ?? null,
    });
    res.status(200).json({ success: true, data: plan });
  }
);

export const configurarDistribucionGrupo = catchAsync<unknown, unknown, ConfigurarDistribucionGrupoInput>(
  async (req, res) => {
    if (!req.user) throw new ApiError(401, 'Usuario no autenticado.');
    const plan = await studyPlanService.configurarDistribucionGrupo(req.body, {
      usuarioId: req.user._id,
      ip: req.ip ?? null,
    });
    res.status(200).json({ success: true, data: plan });
  }
);

export const crearPlanDesdeAnioAnterior = catchAsync<unknown, unknown, CrearPlanDesdeAnioAnteriorInput>(
  async (req, res) => {
    if (!req.user) throw new ApiError(401, 'Usuario no autenticado.');
    const plan = await studyPlanService.crearPlanDesdeAnioAnterior(req.body, {
      usuarioId: req.user._id,
      ip: req.ip ?? null,
    });
    res.status(201).json({ success: true, data: plan });
  }
);

export const obtenerStudyPlan = catchAsync<unknown, unknown, unknown, ObtenerStudyPlanQuery>(async (req, res) => {
  const plan = await studyPlanService.obtenerStudyPlan(req.query);
  res.status(200).json({ success: true, data: plan });
});
