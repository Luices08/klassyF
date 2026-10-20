import { ParsedQs } from 'qs';
import { generarInformeDescriptivoPdf } from '../services/informeDescriptivoPdf.service';
import * as servicio from '../services/valoracionDescriptiva.service';
import catchAsync from '../utils/catchAsync';

export const planilla = catchAsync<unknown, unknown, unknown, ParsedQs & { teacher_assignment_id: string; periodo_numero: number }>(async (req, res) => {
  res.status(200).json({ success: true, data: await servicio.planillaDescriptiva(req.query.teacher_assignment_id, Number(req.query.periodo_numero), req.user!) });
});

export const guardar = catchAsync<unknown, unknown, { teacher_assignment_id: string; periodo_numero: number; valoraciones: servicio.ValoracionEntrada[] }>(async (req, res) => {
  const { teacher_assignment_id, periodo_numero, valoraciones } = req.body;
  res.status(200).json({ success: true, data: await servicio.guardarValoraciones(teacher_assignment_id, periodo_numero, valoraciones, req.user!, req.ip) });
});

export const informe = catchAsync<unknown, unknown, unknown, ParsedQs & { student_id: string; academic_year_id: string; periodo_numero: number }>(async (req, res) => {
  const { buffer, nombreArchivo } = await generarInformeDescriptivoPdf(req.query.student_id, req.query.academic_year_id, Number(req.query.periodo_numero), req.user!, req.ip);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombreArchivo}"`);
  res.send(buffer);
});
