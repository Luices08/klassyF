import { ParamsDictionary } from 'express-serve-static-core';
import fs from 'fs/promises';
import path from 'path';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';
import { detectarFirmaArchivo } from '../utils/firmasArchivo';
import { carpetaSalida } from '../utils/uploadPaths';
import { armarBoletinRetiro } from '../services/boletinRetiro.service';
import { generarPdfBoletinRetiro } from '../services/boletinRetiroPdf.service';
import { ActuarSobreDependenciaInput, actuarSobreDependencia as actuar, vistaPazYSalvoDeSalida } from '../services/pazYSalvoSalida.service';
import * as salidaService from '../services/salidaMatricula.service';
import { FiltrosSalidas, SalidaInput } from '../services/salidaMatricula.service';

type IdParams = ParamsDictionary & { id: string };
type SoporteParams = IdParams & { soporteId: string };
type DependenciaParams = IdParams & { clave: string };

export const listar = catchAsync(async (req, res) => {
  res.status(200).json({ success: true, data: await salidaService.listarSalidas(req.query as unknown as FiltrosSalidas, req.user!) });
});

export const matriculasDisponibles = catchAsync(async (req, res) => {
  const { academic_year_id } = req.query as { academic_year_id: string };
  res.status(200).json({ success: true, data: await salidaService.matriculasParaSalida(academic_year_id, req.user!) });
});

export const registrar = catchAsync<ParamsDictionary, unknown, SalidaInput & { enrollment_id: string }>(async (req, res) => {
  const { enrollment_id, ...salida } = req.body;
  res.status(201).json({ success: true, data: await salidaService.registrarSalida(enrollment_id, salida, req.user!) });
});

export const detalle = catchAsync<IdParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await salidaService.detalleDeSalida(req.params.id, req.user!) });
});

export const cargarSoporte = catchAsync<IdParams>(async (req, res) => {
  const file = req.file;
  if (!file) throw new ApiError(400, 'Debes adjuntar un archivo en el campo "file".');
  const firma = detectarFirmaArchivo(file.mimetype, file.buffer);
  if (!firma) throw new ApiError(400, 'El archivo no es un PDF, JPG, PNG o WEBP válido.');

  const carpeta = carpetaSalida(req.params.id);
  await fs.mkdir(carpeta, { recursive: true });
  const destino = path.join(carpeta, `${Date.now()}${firma.ext}`);
  await fs.writeFile(destino, file.buffer);
  try {
    const data = await salidaService.agregarSoporte(
      req.params.id,
      { nombre: file.originalname.slice(0, 160), archivo_path: path.relative(process.cwd(), destino), mimetype: firma.mimetype, tamano: file.size },
      req.user!,
      req.ip
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    // Si el servicio lo rechaza (sin salida, tope de soportes) no queda un archivo huérfano.
    await fs.rm(destino, { force: true });
    throw error;
  }
});

export const descargarSoporte = catchAsync<SoporteParams>(async (req, res) => {
  const { ruta, nombre, mimetype } = await salidaService.archivoDeSoporte(req.params.id, req.params.soporteId, req.user!, req.ip);
  res.setHeader('Content-Type', mimetype);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(nombre)}"`);
  res.sendFile(path.resolve(process.cwd(), ruta));
});

export const actuarSobreDependencia = catchAsync<DependenciaParams, unknown, ActuarSobreDependenciaInput>(async (req, res) => {
  res.status(200).json({ success: true, data: await actuar(req.params.id, req.params.clave, req.body, req.user!, req.ip) });
});

export const pazYSalvo = catchAsync<IdParams>(async (req, res) => {
  await salidaService.detalleDeSalida(req.params.id, req.user!);
  res.status(200).json({ success: true, data: await vistaPazYSalvoDeSalida(req.params.id) });
});

export const boletin = catchAsync<IdParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await armarBoletinRetiro(req.params.id, req.user!) });
});

export const boletinPdf = catchAsync<IdParams>(async (req, res) => {
  const { buffer, nombreArchivo } = await generarPdfBoletinRetiro(req.params.id, req.user!, req.ip);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombreArchivo}"`);
  res.status(200).send(buffer);
});
