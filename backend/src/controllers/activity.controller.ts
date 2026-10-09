import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import * as activityService from '../services/activity.service';
import * as entregaService from '../services/actividadEntrega.service';
import * as configuracionService from '../services/configuracionActividades.service';
import * as notasService from '../services/notas.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

interface IdParams extends ParamsDictionary {
  id: string;
}

// --- Gestión del docente (CU-DOC-02) ---

export const createActivity = catchAsync<unknown, unknown, activityService.CreateActivityInput>(async (req, res) => {
  const activity = await activityService.createActivity(req.body, req.user!, req.ip);
  res.status(201).json({ success: true, data: activity });
});

export const updateActivity = catchAsync<IdParams, unknown, activityService.UpdateActivityInput>(async (req, res) => {
  const activity = await activityService.updateActivity(req.params.id, req.body, req.user!, req.ip);
  res.status(200).json({ success: true, data: activity });
});

export const deleteActivity = catchAsync<IdParams>(async (req, res) => {
  await activityService.deleteActivity(req.params.id, req.user!, req.ip);
  res.status(200).json({ success: true, data: null });
});

export const revisionCalendario = catchAsync<unknown, unknown, unknown, ParsedQs & activityService.RevisionCalendarioQuery>(
  async (req, res) => {
    const revision = await activityService.revisionDeCalendario(req.query, req.user!);
    res.status(200).json({ success: true, data: revision });
  }
);

export const listActivities = catchAsync<unknown, unknown, unknown, ParsedQs & activityService.ListActivitiesQuery>(async (req, res) => {
  const actividades = await activityService.listActivities(req.query, req.user!);
  res.status(200).json({ success: true, count: actividades.length, data: actividades });
});

export const getActivity = catchAsync<IdParams>(async (req, res) => {
  const usuario = req.user!;
  const detalle =
    usuario.rol === 'ESTUDIANTE'
      ? await entregaService.detalleParaEstudiante(req.params.id, usuario)
      : await activityService.detalleParaGestion(req.params.id, usuario);
  res.status(200).json({ success: true, data: detalle });
});

export const listEntregas = catchAsync<IdParams>(async (req, res) => {
  const entregas = await entregaService.listarEntregas(req.params.id, req.user!);
  res.status(200).json({ success: true, count: entregas.length, data: entregas });
});

// --- Portal del estudiante (CU-EST-03) ---

export const listMisActividades = catchAsync<unknown, unknown, unknown, ParsedQs & entregaService.FiltrosMisActividades>(
  async (req, res) => {
    const actividades = await entregaService.listarMisActividades(req.user!, req.query);
    res.status(200).json({ success: true, count: actividades.length, data: actividades });
  }
);

export const createSubmission = catchAsync<IdParams, unknown, entregaService.RegistrarEntregaInput>(async (req, res) => {
  const entrega = await entregaService.registrarEntrega(req.params.id, req.body, req.file, req.user!, req.ip);
  res.status(201).json({ success: true, data: entrega });
});

export const descargarEntrega = catchAsync<IdParams>(async (req, res) => {
  const { ruta, nombre } = await entregaService.rutaDeEntrega(req.params.id, req.user!);
  res.download(ruta, nombre ?? 'entrega', (err) => {
    if (err && !res.headersSent) res.status(404).json({ success: false, message: 'El archivo de la entrega ya no está disponible.' });
  });
});

// --- Puente hacia M12 ---

export const gradeActivity = catchAsync<IdParams, unknown, notasService.GradeEntryInput | notasService.GradeEntryInput[]>(
  async (req, res) => {
    if (!req.user) throw new ApiError(401, 'No autenticado.');

    const entries = Array.isArray(req.body) ? req.body : [req.body];
    const submissions = await notasService.gradeActivity(req.params.id, entries, req.user, req.ip);
    res.status(200).json({ success: true, count: submissions.length, data: submissions });
  }
);

// --- Política de carga ---

export const obtenerConfiguracion = catchAsync(async (_req, res) => {
  res.status(200).json({ success: true, data: await configuracionService.obtenerConfiguracionActividades() });
});

export const actualizarConfiguracion = catchAsync<unknown, unknown, configuracionService.CambiosConfiguracionActividades>(
  async (req, res) => {
    const configuracion = await configuracionService.actualizarConfiguracionActividades(req.body, req.user!, req.ip);
    res.status(200).json({ success: true, data: configuracion });
  }
);
