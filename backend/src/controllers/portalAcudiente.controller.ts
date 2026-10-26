import { Request } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { env } from '../config/env';
import { TipoDocumentoMatricula } from '../constants/enums';
import type { RespuestaDeContinuidad } from '../services/continuidad.service';
import * as respuestasCitacion from '../services/citacionRespuesta.service';
import * as portal from '../services/portalAcudiente.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

interface HijoParams extends ParamsDictionary {
  studentId: string;
}

/** El QR del certificado apunta al sitio público: PUBLIC_URL si existe; si no, el host con el que llegó la petición. */
const urlBase = (req: Request): string => env.urlPublica || `${req.protocol}://${req.get('host')}`;

export const listarHijos = catchAsync(async (req, res) => {
  res.status(200).json({ success: true, data: await portal.listarHijos(req.user!) });
});

export const notas = catchAsync<HijoParams, unknown, unknown, ParsedQs & { periodo_numero?: string; academic_year_id?: string }>(async (req, res) => {
  const data = await portal.notasDelHijo(req.user!, req.params.studentId, Number(req.query.periodo_numero), req.query.academic_year_id);
  res.status(200).json({ success: true, data });
});

export const notasDelAnio = catchAsync<HijoParams, unknown, unknown, ParsedQs & { academic_year_id?: string }>(async (req, res) => {
  const data = await portal.notasDelAnioDelHijo(req.user!, req.params.studentId, req.query.academic_year_id);
  res.status(200).json({ success: true, data });
});

export const inasistencias = catchAsync<HijoParams, unknown, unknown, ParsedQs & { periodo_numero?: string; academic_year_id?: string }>(async (req, res) => {
  const periodo = req.query.periodo_numero ? Number(req.query.periodo_numero) : undefined;
  const data = await portal.inasistenciasDelHijo(req.user!, req.params.studentId, periodo, req.query.academic_year_id);
  res.status(200).json({ success: true, data });
});

export const convivencia = catchAsync<HijoParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await portal.convivenciaDelHijo(req.user!, req.params.studentId, req.ip) });
});

export const documentos = catchAsync<HijoParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await portal.documentosDelHijo(req.user!, req.params.studentId) });
});

export const subirDocumento = catchAsync<HijoParams & { tipoDocumento: TipoDocumentoMatricula }>(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Debes adjuntar un archivo en el campo "file".');
  const data = await portal.subirDocumentoDelHijo(req.user!, req.params.studentId, req.params.tipoDocumento, req.file);
  res.status(200).json({ success: true, data });
});

export const continuidad = catchAsync<HijoParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await portal.continuidadDelHijo(req.user!, req.params.studentId) });
});

export const responderContinuidad = catchAsync<HijoParams, unknown, RespuestaDeContinuidad>(async (req, res) => {
  res.status(200).json({ success: true, data: await portal.responderContinuidadDelHijo(req.user!, req.params.studentId, req.body, req.ip) });
});

export const certificados = catchAsync<HijoParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await portal.certificadosDelHijo(req.user!, req.params.studentId) });
});

export const generarCertificado = catchAsync<HijoParams, unknown, portal.EntradaCertificadoDelHijo>(async (req, res) => {
  res.status(201).json({ success: true, data: await portal.generarCertificadoDelHijo(req.user!, req.params.studentId, req.body, req.ip) });
});

export const certificadoPdf = catchAsync<HijoParams & { certificadoId: string }>(async (req, res) => {
  const { buffer, nombreArchivo } = await portal.pdfDelCertificadoDelHijo(req.user!, req.params.studentId, req.params.certificadoId, urlBase(req), req.ip);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombreArchivo}"`);
  res.send(buffer);
});

export const citaciones = catchAsync<HijoParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await respuestasCitacion.citacionesDeHijo(req.user!, req.params.studentId) });
});

export const responderCitacion = catchAsync<HijoParams & { destinatarioId: string }, unknown, { respuesta: 'CONFIRMADA' | 'NO_ASISTIRA' }>(async (req, res) => {
  const data = await respuestasCitacion.responderDesdePortal(req.user!, req.params.studentId, req.params.destinatarioId, req.body.respuesta);
  res.status(200).json({ success: true, data });
});
