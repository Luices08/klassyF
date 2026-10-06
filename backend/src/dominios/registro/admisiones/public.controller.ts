import Grade from '../../institucional/estructura/grade.model';
import * as publicInfoService from './publicInfo.service';
import catchAsync from '../../../utils/catchAsync';
import { ESTADO_ACTIVO } from '../../../utils/filtroEstado';

export const obtenerInfoPublica = catchAsync(async (_req, res) => {
  const info = await publicInfoService.obtenerInfoPublica();
  res.status(200).json({ success: true, data: info });
});

export const listarGradosPublicos = catchAsync(async (_req, res) => {
  const grados = await Grade.find({ estado: ESTADO_ACTIVO }).sort({ numero: 1 }).select('nivel numero nombre');
  res.status(200).json({ success: true, data: grados });
});
