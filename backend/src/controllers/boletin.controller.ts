import { ParsedQs } from 'qs';
import { NivelDesempeno } from '../constants/enums';
import { TipoFraseBoletin } from '../constants/boletin';
import * as configService from '../services/boletinConfig.service';
import * as observacionService from '../services/observacionBoletin.service';
import * as publicacionService from '../services/publicacionBoletin.service';
import * as reportCardPdfService from '../services/reportCardPdf.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

export const obtenerConfiguracion = catchAsync(async (_req, res) => {
  res.status(200).json({ success: true, data: await configService.leerConfiguracionBoletin() });
});

export const actualizarConfiguracion = catchAsync<unknown, unknown, configService.CambiosConfiguracionBoletin>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'No autenticado.');
  await configService.actualizarConfiguracionBoletin(req.body, req.user, req.ip);
  res.status(200).json({ success: true, data: await configService.leerConfiguracionBoletin() });
});

export const listarFrases = catchAsync(async (_req, res) => {
  res.status(200).json({ success: true, data: await configService.listarFrases() });
});

interface GuardarFraseBody {
  nivel: NivelDesempeno;
  tipo: TipoFraseBoletin;
  texto: string;
}

export const guardarFrase = catchAsync<unknown, unknown, GuardarFraseBody>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'No autenticado.');
  const { nivel, tipo, texto } = req.body;
  res.status(200).json({ success: true, data: await configService.guardarFrase(nivel, tipo, texto, req.user, req.ip) });
});

interface ConsultaObservaciones extends ParsedQs {
  teacher_assignment_id: string;
  periodo_numero: string;
}

export const listarObservaciones = catchAsync<unknown, unknown, unknown, ConsultaObservaciones>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'No autenticado.');
  const data = await observacionService.listarObservaciones(req.query.teacher_assignment_id, Number(req.query.periodo_numero), req.user);
  res.status(200).json({ success: true, data });
});

interface GuardarObservacionesBody {
  teacher_assignment_id: string;
  periodo_numero: number;
  observaciones: observacionService.ObservacionInput[];
}

export const guardarObservaciones = catchAsync<unknown, unknown, GuardarObservacionesBody>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'No autenticado.');
  const { teacher_assignment_id, periodo_numero, observaciones } = req.body;
  const data = await observacionService.guardarObservaciones(teacher_assignment_id, periodo_numero, observaciones, req.user, req.ip);
  res.status(200).json({ success: true, data });
});

// --- Quién de la familia ve el boletín ---

type ConsultaPublicacion = ParsedQs & { group_id: string; academic_year_id: string; periodo_numero: string };

export const obtenerPublicacion = catchAsync<unknown, unknown, unknown, ConsultaPublicacion>(async (req, res) => {
  const { group_id, academic_year_id, periodo_numero } = req.query;
  const data = await publicacionService.obtenerPublicacion({ group_id, academic_year_id, periodo_numero: Number(periodo_numero) });
  res.status(200).json({ success: true, data });
});

export const publicarGrupo = catchAsync<unknown, unknown, publicacionService.ReferenciaPublicacion & { publicado: boolean }>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'No autenticado.');
  const { publicado, ...referencia } = req.body;
  res.status(200).json({ success: true, data: await publicacionService.establecerPublicacionGrupo(referencia, publicado, req.user, req.ip) });
});

export const accesoEstudiante = catchAsync<
  unknown,
  unknown,
  publicacionService.ReferenciaPublicacion & { student_id: string; permitir: boolean | null }
>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'No autenticado.');
  const { student_id, permitir, ...referencia } = req.body;
  res.status(200).json({ success: true, data: await publicacionService.establecerAccesoEstudiante(referencia, student_id, permitir, req.user, req.ip) });
});

export const descargarMuestraPdf = catchAsync<unknown, unknown, { plantilla?: configService.CambiosConfiguracionBoletin['plantilla'] }>(async (req, res) => {
  const { buffer, nombreArchivo } = await reportCardPdfService.generarPdfMuestra(req.body?.plantilla);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombreArchivo}"`);
  res.send(buffer);
});
