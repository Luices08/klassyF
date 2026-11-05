import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { ClasificacionAcudientes } from '../constants/importacionAcudientes';
import * as servicio from '../services/importacionAcudientes.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

interface IdParams extends ParamsDictionary {
  id: string;
}

export const simular = catchAsync<unknown, unknown, servicio.OpcionesEntradaAcudientes>(async (req, res) => {
  const archivo = req.file;
  if (!archivo) throw new ApiError(400, 'Debes adjuntar el archivo de acudientes (.xlsx, .csv o .txt) en el campo "file".');
  const lote = await servicio.simularImportacion({ buffer: archivo.buffer, nombre: archivo.originalname }, req.user!, req.body, req.ip);
  res.status(201).json({ success: true, data: lote });
});

export const listar = catchAsync(async (req, res) => {
  res.status(200).json({ success: true, data: await servicio.listarImportaciones(req.user!) });
});

export const obtener = catchAsync<IdParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await servicio.obtenerImportacion(req.params.id, req.user!) });
});

export const filas = catchAsync<IdParams, unknown, unknown, { clasificacion?: ClasificacionAcudientes; search?: string; page?: number; limit?: number }>(async (req, res) => {
  const resultado = await servicio.listarFilasImportacion(req.params.id, req.user!, req.query);
  res.status(200).json({ success: true, ...resultado });
});

export const aplicar = catchAsync<IdParams, unknown, { confirm_password: string; confirmo_advertencias: boolean }>(async (req, res) => {
  const lote = await servicio.aplicarImportacion(
    req.params.id,
    { contrasena: req.body.confirm_password, confirmo_advertencias: req.body.confirmo_advertencias },
    req.user!,
    req.ip
  );
  // 202: la aplicación sigue en segundo plano; la pantalla consulta el progreso.
  res.status(202).json({ success: true, data: lote });
});

export const descartar = catchAsync<IdParams>(async (req, res) => {
  await servicio.descartarImportacion(req.params.id, req.user!, req.ip);
  res.status(200).json({ success: true, data: { descartada: true } });
});

export const informe = catchAsync<IdParams>(async (req, res) => {
  const libro = await servicio.informeExcel(req.params.id, req.user!);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="importacion-acudientes.xlsx"');
  res.status(200).send(libro);
});

export const plantilla = catchAsync<unknown, unknown, unknown, ParsedQs & { formato?: string }>(async (req, res) => {
  const { buffer, nombreArchivo, contentType } = await servicio.generarPlantillaAcudientes(req.user!, req.query.formato === 'csv' ? 'csv' : 'xlsx');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  res.status(200).send(buffer);
});
