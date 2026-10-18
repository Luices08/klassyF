import { ParsedQs } from 'qs';
import { EstadoAnticipada, TipoAnticipada } from '../constants/promocionAnticipada';
import * as configuracion from '../services/configuracionPromocionAnticipada.service';
import * as pdf from '../services/resolucionAnticipadaPdf.service';
import * as tramites from '../services/promocionAnticipada.service';
import catchAsync from '../utils/catchAsync';

type Id = { id: string };
const ok = <T>(data: T) => ({ success: true, data });

export const obtenerConfiguracion = catchAsync(async (_req, res) => {
  res.status(200).json(ok(await configuracion.obtenerConfiguracion()));
});
export const actualizarConfiguracion = catchAsync<unknown, unknown, Parameters<typeof configuracion.actualizarConfiguracion>[0]>(async (req, res) => {
  res.status(200).json(ok(await configuracion.actualizarConfiguracion(req.body, req.user!, req.ip)));
});

export const solicitar = catchAsync<unknown, unknown, tramites.EntradaSolicitud>(async (req, res) => {
  res.status(201).json(ok(await tramites.solicitar(req.body, req.user!, req.ip)));
});
export const listar = catchAsync<unknown, unknown, unknown, ParsedQs & { academic_year_id?: string; estado?: EstadoAnticipada; tipo?: TipoAnticipada; student_id?: string }>(async (req, res) => {
  res.status(200).json(ok(await tramites.listar(req.query, req.user!)));
});
export const obtener = catchAsync<Id>(async (req, res) => {
  res.status(200).json(ok(await tramites.obtener(req.params.id, req.user!)));
});
export const consentimiento = catchAsync<Id, unknown, tramites.EntradaConsentimiento>(async (req, res) => {
  res.status(200).json(ok(await tramites.registrarConsentimiento(req.params.id, req.body, req.user!, req.ip)));
});
export const resolucion = catchAsync<Id, unknown, { fundamento: string; confirm_password: string }>(async (req, res) => {
  res.status(200).json(ok(await tramites.emitirResolucion(req.params.id, req.body.fundamento, req.body.confirm_password, req.user!, req.ip)));
});
export const aplicar = catchAsync<Id, unknown, { grupo_destino_id: string }>(async (req, res) => {
  res.status(200).json(ok(await tramites.aplicar(req.params.id, req.body.grupo_destino_id, req.user!, req.ip)));
});
export const nivelacion = catchAsync<Id & { subjectId: string }, unknown, { nota: number }>(async (req, res) => {
  res.status(200).json(ok(await tramites.registrarNivelacion(req.params.id, req.params.subjectId, req.body.nota, req.user!, req.ip)));
});
export const anular = catchAsync<Id, unknown, { motivo: string }>(async (req, res) => {
  res.status(200).json(ok(await tramites.anular(req.params.id, req.body.motivo, req.user!, req.ip)));
});
export const integridad = catchAsync<Id>(async (req, res) => {
  res.status(200).json(ok(await tramites.verificarIntegridad(req.params.id, req.user!)));
});
export const resolucionPdf = catchAsync<Id>(async (req, res) => {
  const { buffer, nombreArchivo } = await pdf.generarPdfResolucion(req.params.id, req.user!);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombreArchivo}"`);
  res.send(buffer);
});
