import { ParsedQs } from 'qs';
import { InstanciaSesion } from '../constants/comision';
import * as actaPdf from '../services/actaSesionPdf.service';
import * as configuracion from '../services/configuracionComision.service';
import * as ficha from '../services/fichaComision.service';
import * as riesgo from '../services/riesgoAcademico.service';
import * as sesiones from '../services/sesionComision.service';
import catchAsync from '../utils/catchAsync';

type Id = { id: string };
const ok = <T>(data: T) => ({ success: true, data });

export const obtenerConfiguracion = catchAsync(async (_req, res) => {
  res.status(200).json(ok(await configuracion.obtenerConfiguracion()));
});
export const actualizarConfiguracion = catchAsync<unknown, unknown, Parameters<typeof configuracion.actualizarConfiguracion>[0]>(async (req, res) => {
  res.status(200).json(ok(await configuracion.actualizarConfiguracion(req.body, req.user!, req.ip)));
});

export const tablero = catchAsync<unknown, unknown, unknown, ParsedQs & { academic_year_id: string; periodo_numero: string; group_id?: string; grade_id?: string; sede_id?: string }>(async (req, res) => {
  const q = req.query;
  res.status(200).json(ok(await riesgo.tableroDeRiesgo({ academic_year_id: q.academic_year_id, periodo_numero: Number(q.periodo_numero), group_id: q.group_id, grade_id: q.grade_id, sede_id: q.sede_id }, req.user!, req.ip)));
});

export const fichaDeEstudiante = catchAsync<{ studentId: string }, unknown, unknown, ParsedQs & { academic_year_id: string }>(async (req, res) => {
  res.status(200).json(ok(await ficha.fichaDeEstudiante(req.params.studentId, req.query.academic_year_id, req.user!)));
});

export const listarSesiones = catchAsync<unknown, unknown, unknown, ParsedQs & { academic_year_id?: string; instancia?: InstanciaSesion; estado?: string }>(async (req, res) => {
  res.status(200).json(ok(await sesiones.listarSesiones(req.query, req.user!)));
});
export const obtenerSesion = catchAsync<Id>(async (req, res) => {
  res.status(200).json(ok(await sesiones.detalleDeSesion(req.params.id, req.user!)));
});
export const crearSesion = catchAsync<unknown, unknown, sesiones.EntradaSesion>(async (req, res) => {
  res.status(201).json(ok(await sesiones.crearSesion(req.body, req.user!, req.ip)));
});
export const actualizarSesion = catchAsync<Id, unknown, sesiones.CambiosSesion>(async (req, res) => {
  res.status(200).json(ok(await sesiones.actualizarSesion(req.params.id, req.body, req.user!)));
});
export const convocar = catchAsync<Id>(async (req, res) => {
  res.status(200).json(ok(await sesiones.convocar(req.params.id, req.user!, req.ip)));
});
export const realizar = catchAsync<Id>(async (req, res) => {
  res.status(200).json(ok(await sesiones.realizar(req.params.id, req.user!, req.ip)));
});
export const agregarCaso = catchAsync<Id, unknown, Parameters<typeof sesiones.agregarCaso>[1]>(async (req, res) => {
  res.status(201).json(ok(await sesiones.agregarCaso(req.params.id, req.body, req.user!)));
});
export const actualizarCaso = catchAsync<Id & { casoId: string }, unknown, sesiones.CambiosCaso>(async (req, res) => {
  res.status(200).json(ok(await sesiones.actualizarCaso(req.params.id, req.params.casoId, req.body, req.user!)));
});
export const quitarCaso = catchAsync<Id & { casoId: string }>(async (req, res) => {
  res.status(200).json(ok(await sesiones.quitarCaso(req.params.id, req.params.casoId, req.user!)));
});
export const agregarCompromiso = catchAsync<Id, unknown, sesiones.EntradaCompromiso>(async (req, res) => {
  res.status(201).json(ok(await sesiones.agregarCompromiso(req.params.id, req.body, req.user!)));
});
export const actualizarCompromiso = catchAsync<Id & { compromisoId: string }, unknown, Parameters<typeof sesiones.actualizarCompromiso>[2]>(async (req, res) => {
  res.status(200).json(ok(await sesiones.actualizarCompromiso(req.params.id, req.params.compromisoId, req.body, req.user!)));
});
export const firmar = catchAsync<Id, unknown, { confirm_password: string }>(async (req, res) => {
  res.status(200).json(ok(await sesiones.firmar(req.params.id, req.body.confirm_password, req.user!, req.ip)));
});
export const anular = catchAsync<Id, unknown, { motivo: string }>(async (req, res) => {
  res.status(200).json(ok(await sesiones.anular(req.params.id, req.body.motivo, req.user!, req.ip)));
});
export const integridad = catchAsync<Id>(async (req, res) => {
  res.status(200).json(ok(await sesiones.verificarIntegridad(req.params.id, req.user!)));
});
export const pdf = catchAsync<Id>(async (req, res) => {
  const { buffer, nombreArchivo } = await actaPdf.generarPdfActaSesion(req.params.id, req.user!);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombreArchivo}"`);
  res.send(buffer);
});
