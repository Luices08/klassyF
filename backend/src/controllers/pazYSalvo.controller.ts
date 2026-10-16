import { ParamsDictionary } from 'express-serve-static-core';
import fs from 'fs/promises';
import path from 'path';
import * as pazYSalvoService from '../services/pazYSalvo.service';
import { FiltroListadoPazYSalvo, RevisionPazYSalvo } from '../services/pazYSalvo.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';
import { detectarFirmaArchivo } from '../utils/firmasArchivo';
import { carpetaPazYSalvo } from '../utils/uploadPaths';

interface EstudianteAnioParams extends ParamsDictionary {
  studentId: string;
  anioId: string;
}

export const listarPazYSalvo = catchAsync(async (req, res) => {
  // El validador ya exige academic_year_id y convierte page/limit.
  const filtro = req.query as unknown as FiltroListadoPazYSalvo;
  const resultado = await pazYSalvoService.listarPazYSalvo({ id: req.user!._id, rol: req.user!.rol }, filtro);
  res.status(200).json({ success: true, ...resultado });
});

export const cargarPazYSalvo = catchAsync<EstudianteAnioParams>(async (req, res) => {
  const file = req.file;
  if (!file) throw new ApiError(400, 'Debes adjuntar un archivo en el campo "file".');
  const firma = detectarFirmaArchivo(file.mimetype, file.buffer);
  if (!firma) throw new ApiError(400, 'El archivo no es un PDF, JPG, PNG o WEBP válido.');

  const actor = { id: req.user!._id, rol: req.user!.rol };
  // La carpeta se escribe después de las comprobaciones de permiso del servicio solo si pasan: se guarda el archivo y, si el
  // servicio lo rechaza, se retira para no dejar soportes huérfanos.
  const carpeta = carpetaPazYSalvo(req.params.anioId);
  await fs.mkdir(carpeta, { recursive: true });
  const destino = path.join(carpeta, `${req.params.studentId}-${Date.now()}${firma.ext}`);
  await fs.writeFile(destino, file.buffer);
  try {
    const registro = await pazYSalvoService.cargarPazYSalvo(actor, req.params.studentId, req.params.anioId, path.relative(process.cwd(), destino));
    res.status(200).json({ success: true, data: registro });
  } catch (error) {
    await fs.rm(destino, { force: true });
    throw error;
  }
});

export const revisarPazYSalvo = catchAsync<EstudianteAnioParams, unknown, RevisionPazYSalvo>(async (req, res) => {
  const registro = await pazYSalvoService.revisarPazYSalvo(
    { id: req.user!._id, rol: req.user!.rol },
    req.params.studentId,
    req.params.anioId,
    req.body
  );
  res.status(200).json({ success: true, data: registro });
});

export const descargarPazYSalvo = catchAsync<ParamsDictionary & { id: string }>(async (req, res) => {
  const ruta = await pazYSalvoService.obtenerArchivoPazYSalvo({ id: req.user!._id, rol: req.user!.rol }, req.params.id);
  res.sendFile(path.resolve(process.cwd(), ruta));
});
