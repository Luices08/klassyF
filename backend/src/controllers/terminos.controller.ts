import * as terminos from '../services/terminos.service';
import catchAsync from '../utils/catchAsync';

export const documentos = catchAsync(async (_req, res) => {
  res.status(200).json({ success: true, data: terminos.documentosVigentes() });
});

export const pendientes = catchAsync(async (req, res) => {
  res.status(200).json({ success: true, data: await terminos.pendientesDe(req.user!) });
});

export const aceptar = catchAsync(async (req, res) => {
  const data = await terminos.aceptar(req.user!, req.body.terminos, req.ip ?? null, req.get('user-agent') ?? null);
  res.status(200).json({ success: true, data });
});
