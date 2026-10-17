import { ParamsDictionary } from 'express-serve-static-core';
import fs from 'fs/promises';
import path from 'path';
import * as escalaService from '../services/escalaExterna.service';
import { EscalaExternaInput } from '../services/escalaExterna.service';
import * as trasladoService from '../services/traslado.service';
import { CrearTrasladoInput, FilaHomologacionInput, GuardarHomologacionInput, TrasladoInput } from '../services/traslado.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';
import { detectarFirmaArchivo } from '../utils/firmasArchivo';
import { carpetaTraslado } from '../utils/uploadPaths';

type IdParams = ParamsDictionary & { id: string };
type SoporteParams = IdParams & { soporteId: string };

export const listar = catchAsync(async (req, res) => {
  const { academic_year_id, search } = req.query as { academic_year_id: string; search?: string };
  res.status(200).json({ success: true, data: await trasladoService.listarTraslados(academic_year_id, search) });
});

export const matriculasDisponibles = catchAsync(async (req, res) => {
  const { academic_year_id } = req.query as { academic_year_id: string };
  res.status(200).json({ success: true, data: await trasladoService.matriculasDisponibles(academic_year_id) });
});

export const crear = catchAsync<ParamsDictionary, unknown, CrearTrasladoInput>(async (req, res) => {
  const traslado = await trasladoService.crearTraslado(req.body, req.user!, req.ip);
  res.status(201).json({ success: true, data: await trasladoService.detalleTraslado(String(traslado._id)) });
});

export const actualizar = catchAsync<IdParams, unknown, TrasladoInput>(async (req, res) => {
  await trasladoService.actualizarTraslado(req.params.id, req.body, req.user!, req.ip);
  res.status(200).json({ success: true, data: await trasladoService.detalleTraslado(req.params.id) });
});

export const detalle = catchAsync<IdParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await trasladoService.detalleTraslado(req.params.id) });
});

export const vistaPrevia = catchAsync<IdParams, unknown, { filas: FilaHomologacionInput[] }>(async (req, res) => {
  res.status(200).json({ success: true, data: await trasladoService.vistaPreviaHomologacion(req.params.id, req.body.filas) });
});

export const guardarHomologacion = catchAsync<IdParams, unknown, GuardarHomologacionInput>(async (req, res) => {
  res.status(200).json({ success: true, data: await trasladoService.guardarHomologacion(req.params.id, req.body, req.user!, req.ip) });
});

export const cargarSoporte = catchAsync<IdParams>(async (req, res) => {
  const file = req.file;
  if (!file) throw new ApiError(400, 'Debes adjuntar un archivo en el campo "file".');
  const firma = detectarFirmaArchivo(file.mimetype, file.buffer);
  if (!firma) throw new ApiError(400, 'El archivo no es un PDF, JPG, PNG o WEBP válido.');

  const carpeta = carpetaTraslado(req.params.id);
  await fs.mkdir(carpeta, { recursive: true });
  const destino = path.join(carpeta, `${Date.now()}${firma.ext}`);
  await fs.writeFile(destino, file.buffer);
  try {
    const data = await trasladoService.agregarSoporte(
      req.params.id,
      { nombre: file.originalname.slice(0, 160), archivo_path: path.relative(process.cwd(), destino), mimetype: firma.mimetype, tamano: file.size },
      req.user!,
      req.ip
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    // Si el servicio lo rechaza (traslado inexistente, año cerrado, tope de soportes) no queda un archivo huérfano.
    await fs.rm(destino, { force: true });
    throw error;
  }
});

export const descargarSoporte = catchAsync<SoporteParams>(async (req, res) => {
  const { ruta } = await trasladoService.archivoDeSoporte(req.params.id, req.params.soporteId, req.user!, req.ip);
  res.sendFile(path.resolve(process.cwd(), ruta));
});

export const quitarSoporte = catchAsync<SoporteParams>(async (req, res) => {
  const ruta = await trasladoService.quitarSoporte(req.params.id, req.params.soporteId, req.user!, req.ip);
  await fs.rm(path.resolve(process.cwd(), ruta), { force: true });
  res.status(200).json({ success: true, data: await trasladoService.detalleTraslado(req.params.id) });
});

// --- Escalas externas ---

export const listarEscalas = catchAsync(async (req, res) => {
  const { solo_activas } = req.query as { solo_activas?: boolean };
  res.status(200).json({ success: true, data: await escalaService.listarEscalas(Boolean(solo_activas)) });
});

export const crearEscala = catchAsync<ParamsDictionary, unknown, EscalaExternaInput>(async (req, res) => {
  res.status(201).json({ success: true, data: await escalaService.crearEscala(req.body, req.user!, req.ip) });
});

export const actualizarEscala = catchAsync<IdParams, unknown, EscalaExternaInput>(async (req, res) => {
  res.status(200).json({ success: true, data: await escalaService.actualizarEscala(req.params.id, req.body, req.user!, req.ip) });
});

export const estadoEscala = catchAsync<IdParams, unknown, { estado: 'activo' | 'inactivo' }>(async (req, res) => {
  res.status(200).json({ success: true, data: await escalaService.cambiarEstadoEscala(req.params.id, req.body.estado, req.user!, req.ip) });
});

export const eliminarEscala = catchAsync<IdParams>(async (req, res) => {
  await escalaService.eliminarEscala(req.params.id, req.user!, req.ip);
  res.status(200).json({ success: true, data: null });
});
