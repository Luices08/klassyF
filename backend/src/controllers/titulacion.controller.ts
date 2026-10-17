import { ParsedQs } from 'qs';
import { EstadoTitulacion } from '../constants/titulacion';
import * as servicio from '../services/titulacion.service';
import catchAsync from '../utils/catchAsync';

export const requisitos = catchAsync<{ studentId: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await servicio.requisitosDeEstudiante(req.params.studentId, req.user!) });
});

export const registrarServicioSocial = catchAsync<unknown, unknown, servicio.EntradaServicioSocial>(async (req, res) => {
  res.status(201).json({ success: true, data: await servicio.registrarServicioSocial(req.body, req.user!, req.ip) });
});

export const anularServicioSocial = catchAsync<{ id: string }, unknown, { motivo: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await servicio.anularServicioSocial(req.params.id, req.body.motivo, req.user!, req.ip) });
});

export const registrarSaber11 = catchAsync<{ studentId: string }, unknown, { codigo_registro: string; fecha_presentacion?: Date | null }>(async (req, res) => {
  res.status(200).json({ success: true, data: await servicio.registrarSaber11(req.params.studentId, req.body.codigo_registro, req.body.fecha_presentacion ?? null, req.user!, req.ip) });
});

export const registrarCertificadoExterno = catchAsync<unknown, unknown, { student_id: string; grado_numero: number; institucion_origen: string; anio?: number | null }>(async (req, res) => {
  res.status(201).json({ success: true, data: await servicio.registrarCertificadoExterno(req.body, req.user!, req.ip) });
});

export const listarTitulaciones = catchAsync<unknown, unknown, unknown, ParsedQs & { academic_year_id: string; estado?: EstadoTitulacion }>(async (req, res) => {
  res.status(200).json({ success: true, data: await servicio.listarTitulaciones(req.query, req.user!) });
});

export const reevaluar = catchAsync<unknown, unknown, { student_id: string; academic_year_id: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await servicio.reevaluarTitulacion(req.body.student_id, req.body.academic_year_id, req.user!) });
});
