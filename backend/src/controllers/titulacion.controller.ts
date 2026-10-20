import fs from 'fs/promises';
import path from 'path';
import { ParsedQs } from 'qs';
import { EstadoTitulacion } from '../constants/titulacion';
import * as servicio from '../services/titulacion.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';
import { detectarFirmaArchivo } from '../utils/firmasArchivo';
import { carpetaServicioSocial } from '../utils/uploadPaths';

export const requisitos = catchAsync<{ studentId: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await servicio.requisitosDeEstudiante(req.params.studentId, req.user!) });
});

/** Multipart: los datos de la tanda y el soporte en `file`. El archivo se confirma por su firma de bytes y vive en `uploads/servicio-social/<estudiante>/`. */
export const registrarServicioSocial = catchAsync<unknown, unknown, servicio.EntradaServicioSocial>(async (req, res) => {
  const file = req.file;
  if (!file) throw new ApiError(400, 'Adjunta el soporte (certificado de la entidad) en el campo "file".');
  const firma = detectarFirmaArchivo(file.mimetype, file.buffer);
  if (!firma) throw new ApiError(400, 'El soporte no es un PDF, JPG, PNG o WEBP válido.');

  const carpeta = carpetaServicioSocial(req.body.student_id);
  await fs.mkdir(carpeta, { recursive: true });
  const destino = path.join(carpeta, `${Date.now()}${firma.ext}`);
  await fs.writeFile(destino, file.buffer);
  try {
    const data = await servicio.registrarServicioSocial(
      req.body,
      { nombre: file.originalname.slice(0, 160), archivo_path: path.relative(process.cwd(), destino), mimetype: firma.mimetype, tamano: file.size },
      req.user!,
      req.ip
    );
    res.status(201).json({ success: true, data });
  } catch (error) {
    // Si el servicio lo rechaza (estudiante, grado, alcance) no queda un archivo huérfano.
    await fs.rm(destino, { force: true });
    throw error;
  }
});

export const listarServicioSocial = catchAsync<{ studentId: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await servicio.listarServicioSocial(req.params.studentId, req.user!) });
});

export const verificarServicioSocial = catchAsync<{ id: string }, unknown, { decision: 'VERIFICAR' | 'RECHAZAR'; motivo?: string }>(async (req, res) => {
  const registro = await servicio.verificarServicioSocial(req.params.id, req.body.decision, req.body.motivo ?? '', req.user!, req.ip);
  res.status(200).json({ success: true, data: { _id: String(registro._id), verificacion: registro.verificacion } });
});

export const soporteServicioSocial = catchAsync<{ id: string }>(async (req, res) => {
  const { ruta, nombre, mimetype } = await servicio.archivoDeServicioSocial(req.params.id, req.user!, req.ip);
  res.setHeader('Content-Type', mimetype);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(nombre)}"`);
  res.sendFile(path.resolve(process.cwd(), ruta));
});

export const anularServicioSocial = catchAsync<{ id: string }, unknown, { motivo: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await servicio.anularServicioSocial(req.params.id, req.body.motivo, req.user!, req.ip) });
});

export const registrarSaber11 = catchAsync<{ studentId: string }, unknown, { codigo_registro: string; fecha_presentacion?: Date | null }>(async (req, res) => {
  res.status(200).json({ success: true, data: await servicio.registrarSaber11(req.params.studentId, req.body.codigo_registro, req.body.fecha_presentacion ?? null, req.user!, req.ip) });
});

export const reevaluar = catchAsync<unknown, unknown, { student_id: string; academic_year_id: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await servicio.reevaluarTitulacion(req.body.student_id, req.body.academic_year_id, req.user!) });
});

export const listarTitulaciones = catchAsync<unknown, unknown, unknown, ParsedQs & { academic_year_id: string; estado?: EstadoTitulacion }>(async (req, res) => {
  res.status(200).json({ success: true, data: await servicio.listarTitulaciones(req.query, req.user!) });
});
