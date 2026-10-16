import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import * as activityService from '../services/activity.service';
import * as adjuntosService from '../services/actividadAdjuntos.service';
import * as entregaService from '../services/actividadEntrega.service';
import * as revisionService from '../services/actividadRevision.service';
import * as configuracionService from '../services/configuracionActividades.service';
import { exigirAccesoALaActividad } from '../services/actividadPermisos.service';
import * as notasService from '../services/notas.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

interface IdParams extends ParamsDictionary {
  id: string;
}

// --- Gestión del docente (CU-DOC-02) ---

export const createActivity = catchAsync<unknown, unknown, activityService.CreateActivityInput>(async (req, res) => {
  const resultado = await activityService.publicarActividad(req.body, req.user!, req.ip);
  // `data` sigue siendo la actividad de la clase desde la que se programó; las copias en otros grupos y las que no se pudieron publicar van aparte.
  res.status(201).json({ success: true, data: resultado.actividad, copias: resultado.copias, omitidas: resultado.omitidas });
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

export const cargaDelGrupo = catchAsync<unknown, unknown, unknown, ParsedQs & activityService.CargaDelGrupoQuery>(async (req, res) => {
  const carga = await activityService.cargaDelGrupo(req.query, req.user!);
  res.status(200).json({ success: true, data: carga });
});

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

export const descargarEntrega = catchAsync<IdParams, unknown, unknown, ParsedQs & { intento?: string }>(async (req, res) => {
  const intento = req.query.intento ? Number(req.query.intento) : undefined;
  const { ruta, nombre } = await entregaService.rutaDeEntrega(req.params.id, req.user!, intento);
  res.download(ruta, nombre ?? 'entrega', (err) => {
    if (err && !res.headersSent) res.status(404).json({ success: false, message: 'El archivo de la entrega ya no está disponible.' });
  });
});

export const elegirIntentoValido = catchAsync<IdParams & { studentId: string }, unknown, { intento: number }>(async (req, res) => {
  const entrega = await entregaService.elegirIntentoValido(req.params.id, req.params.studentId, req.body.intento, req.user!, req.ip);
  res.status(200).json({ success: true, data: entrega });
});

// --- Adjuntos del docente ---

interface ArchivoDeMulter {
  path: string;
  originalname: string;
  mimetype: string;
}

export const subirAdjuntos = catchAsync(async (req, res) => {
  const archivos = ((req.files ?? []) as ArchivoDeMulter[]).map(({ path, originalname, mimetype }) => ({ path, originalname, mimetype }));
  if (archivos.length === 0) throw new ApiError(400, 'Selecciona al menos un archivo.');
  const adjuntos = await adjuntosService.guardarAdjuntos(archivos);
  res.status(201).json({ success: true, count: adjuntos.length, data: adjuntos });
});

export const descargarAdjunto = catchAsync<IdParams & { adjuntoId: string }>(async (req, res) => {
  const { actividad } = await exigirAccesoALaActividad(req.params.id, req.user!);
  const adjunto = (actividad.adjuntos ?? []).find((a) => a.id === req.params.adjuntoId);
  if (!adjunto) throw new ApiError(404, 'Adjunto no encontrado.');
  res.download(adjuntosService.rutaDelAdjunto(adjunto), adjunto.nombre, (err) => {
    if (err && !res.headersSent) res.status(404).json({ success: false, message: 'El archivo ya no está disponible.' });
  });
});

// --- Revisión: análisis, acceso especial y comentarios ---

export const analisisActividad = catchAsync<IdParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await revisionService.analisisDeActividad(req.params.id, req.user!) });
});

export const otorgarAccesoEspecial = catchAsync<IdParams, unknown, revisionService.OtorgarAccesoInput>(async (req, res) => {
  const acceso = await revisionService.otorgarAccesoEspecial(req.params.id, req.body, req.user!, req.ip);
  res.status(201).json({ success: true, data: acceso });
});

export const revocarAccesoEspecial = catchAsync<IdParams & { studentId: string }>(async (req, res) => {
  await revisionService.revocarAccesoEspecial(req.params.id, req.params.studentId, req.user!, req.ip);
  res.status(200).json({ success: true, data: null });
});

export const listarComentarios = catchAsync<IdParams>(async (req, res) => {
  const comentarios = await revisionService.listarComentarios(req.params.id, req.user!);
  res.status(200).json({ success: true, count: comentarios.length, data: comentarios });
});

export const crearComentario = catchAsync<IdParams, unknown, { texto: string }>(async (req, res) => {
  const comentario = await revisionService.crearComentario(req.params.id, req.body.texto, req.user!);
  res.status(201).json({ success: true, data: comentario });
});

export const eliminarComentario = catchAsync<IdParams & { comentarioId: string }>(async (req, res) => {
  await revisionService.eliminarComentario(req.params.id, req.params.comentarioId, req.user!, req.ip);
  res.status(200).json({ success: true, data: null });
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
