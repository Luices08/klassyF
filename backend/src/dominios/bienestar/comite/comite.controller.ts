import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { EstadoUsuario } from '../../../constants/enums';
import * as actaPdf from './actaComitePdf.service';
import * as casoService from '../convivencia/caso.service';
import * as comiteService from './comite.service';
import * as retencionService from '../convivencia/retencion.service';
import catchAsync from '../../../utils/catchAsync';

interface IdParams extends ParamsDictionary {
  id: string;
}

type ConsultaAnio = ParsedQs & { academic_year_id?: string; incluir_inactivos?: string };

export const listarMiembros = catchAsync<unknown, unknown, unknown, ConsultaAnio>(async (req, res) => {
  const resultado = await comiteService.listarMiembros(req.user!, req.query.academic_year_id, String(req.query.incluir_inactivos) === 'true');
  res.status(200).json({ success: true, data: resultado });
});

export const crearMiembro = catchAsync<unknown, unknown, comiteService.DatosMiembro, ConsultaAnio>(async (req, res) => {
  res.status(201).json({ success: true, data: await comiteService.crearMiembro(req.body, req.user!, req.query.academic_year_id, req.ip) });
});

export const actualizarMiembro = catchAsync<IdParams, unknown, Partial<comiteService.DatosMiembro>>(async (req, res) => {
  res.status(200).json({ success: true, data: await comiteService.actualizarMiembro(req.params.id, req.body, req.user!, req.ip) });
});

export const cambiarEstadoMiembro = catchAsync<IdParams, unknown, { estado: EstadoUsuario }>(async (req, res) => {
  res.status(200).json({ success: true, data: await comiteService.cambiarEstadoMiembro(req.params.id, req.body.estado, req.user!, req.ip) });
});

export const eliminarMiembro = catchAsync<IdParams>(async (req, res) => {
  await comiteService.eliminarMiembro(req.params.id, req.user!, req.ip);
  res.status(200).json({ success: true });
});

export const listarSesiones = catchAsync<unknown, unknown, unknown, ConsultaAnio>(async (req, res) => {
  res.status(200).json({ success: true, data: await comiteService.listarSesiones(req.user!, req.query.academic_year_id) });
});

export const obtenerSesion = catchAsync<IdParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await comiteService.obtenerSesion(req.params.id, req.user!) });
});

export const crearSesion = catchAsync<unknown, unknown, comiteService.DatosSesion>(async (req, res) => {
  res.status(201).json({ success: true, data: await comiteService.crearSesion(req.body, req.user!, req.ip) });
});

export const actualizarSesion = catchAsync<IdParams, unknown, comiteService.ActualizarSesionInput>(async (req, res) => {
  res.status(200).json({ success: true, data: await comiteService.actualizarSesion(req.params.id, req.body, req.user!, req.ip) });
});

export const firmarSesion = catchAsync<IdParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await comiteService.firmarSesion(req.params.id, req.user!, req.ip) });
});

export const verificarIntegridad = catchAsync<IdParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await comiteService.verificarIntegridad(req.params.id, req.user!) });
});

export const agregarAnexo = catchAsync<IdParams, unknown, { texto: string }>(async (req, res) => {
  res.status(201).json({ success: true, data: await comiteService.agregarAnexo(req.params.id, req.body.texto, req.user!, req.ip) });
});

export const anularSesion = catchAsync<IdParams, unknown, { motivo: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await comiteService.anularSesion(req.params.id, req.body.motivo, req.user!, req.ip) });
});

/** El acta se descarga con sesión, nunca por una URL pública. */
export const descargarActa = catchAsync<IdParams>(async (req, res) => {
  const { buffer, nombreArchivo } = await actaPdf.generarPdfActa(req.params.id, req.user!, req.ip);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombreArchivo}"`);
  res.send(buffer);
});

export const reporteRetencion = catchAsync(async (req, res) => {
  res.status(200).json({ success: true, data: await retencionService.reporteRetencion(req.user!, req.ip) });
});

export const casosConAlertas = catchAsync(async (req, res) => {
  const casos = await casoService.casosConAlertas(req.user!);
  res.status(200).json({ success: true, count: casos.length, data: casos });
});
