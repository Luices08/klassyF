import { ofertaDeAdmision } from '../services/ofertaAdmision.service';
import * as publicInfoService from '../services/publicInfo.service';
import catchAsync from '../utils/catchAsync';

export const obtenerInfoPublica = catchAsync(async (_req, res) => {
  const info = await publicInfoService.obtenerInfoPublica();
  res.status(200).json({ success: true, data: info });
});

export const listarOfertaDeAdmision = catchAsync(async (_req, res) => {
  res.status(200).json({ success: true, data: await ofertaDeAdmision() });
});
