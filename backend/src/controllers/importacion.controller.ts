import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import * as importacion from '../services/importacionConvivencia.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

interface ProcesoParams extends ParamsDictionary {
  proceso: string;
}

export const descargarPlantilla = catchAsync<ProcesoParams, unknown, unknown, ParsedQs & { formato?: 'xlsx' | 'csv'; group_id?: string }>(async (req, res) => {
  const { buffer, nombreArchivo, contentType } = await importacion.generarPlantilla(req.params.proceso, req.user!, {
    formato: req.query.formato === 'csv' ? 'csv' : 'xlsx',
    group_id: req.query.group_id,
  });
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  res.send(buffer);
});

export const importar = catchAsync<ProcesoParams>(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Adjunta el archivo en el campo "archivo".');
  const resultado = await importacion.importarArchivo(req.params.proceso, req.file, req.user!, req.ip);
  res.status(201).json({ success: true, data: resultado });
});

export const listarLotes = catchAsync(async (req, res) => {
  const lotes = await importacion.listarLotes(req.user!);
  res.status(200).json({ success: true, count: lotes.length, data: lotes });
});

export const anularLote = catchAsync<ParamsDictionary & { id: string }, unknown, { motivo: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await importacion.anularLote(req.params.id, req.body.motivo, req.user!, req.ip) });
});
