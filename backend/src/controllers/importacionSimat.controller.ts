import { ParamsDictionary } from 'express-serve-static-core';
import { ClasificacionSimat } from '../constants/importacionSimat';
import * as servicio from '../services/importacionSimat.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

interface IdParams extends ParamsDictionary {
  id: string;
}

export const simular = catchAsync<unknown, unknown, servicio.OpcionesEntrada>(async (req, res) => {
  const archivo = req.file;
  if (!archivo) throw new ApiError(400, 'Debes adjuntar el archivo de SIMAT (.xlsx, .csv o .txt) en el campo "file".');
  const lote = await servicio.simularImportacion({ buffer: archivo.buffer, nombre: archivo.originalname }, req.user!, req.body, req.ip);
  res.status(201).json({ success: true, data: lote });
});

export const listar = catchAsync(async (req, res) => {
  res.status(200).json({ success: true, data: await servicio.listarImportaciones(req.user!) });
});

export const obtener = catchAsync<IdParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await servicio.obtenerImportacion(req.params.id, req.user!) });
});

export const filas = catchAsync<IdParams, unknown, unknown, { clasificacion?: ClasificacionSimat; search?: string; page?: number; limit?: number }>(async (req, res) => {
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
  res.setHeader('Content-Disposition', 'attachment; filename="importacion-simat.xlsx"');
  res.status(200).send(libro);
});

export const marcarRevisado = catchAsync<IdParams>(async (req, res) => {
  const perfil = await servicio.marcarEstudianteRevisado(req.params.id, req.user!, req.ip);
  res.status(200).json({ success: true, data: perfil });
});
