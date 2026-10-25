import * as foliaturaService from '../services/foliatura.service';
import catchAsync from '../utils/catchAsync';

export const verFoliatura = catchAsync<unknown, unknown, unknown, { anio?: number }>(async (req, res) => {
  const anio = req.query.anio ? Number(req.query.anio) : undefined;
  res.status(200).json({ success: true, data: await foliaturaService.vistaFoliatura(anio) });
});

export const actualizarFoliatura = catchAsync<unknown, unknown, foliaturaService.CambiosFoliatura>(async (req, res) => {
  const vista = await foliaturaService.actualizarFoliatura(req.body, req.user!, req.ip);
  res.status(200).json({ success: true, data: vista });
});
