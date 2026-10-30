import { ofertaDeAdmision } from '../services/ofertaAdmision.service';
import * as publicInfoService from '../services/publicInfo.service';
import catchAsync from '../utils/catchAsync';

export const obtenerInfoPublica = catchAsync(async (_req, res) => {
  const info = await publicInfoService.obtenerInfoPublica();
  res.status(200).json({ success: true, data: info });
});

export const listarOfertaDeAdmision = catchAsync<unknown, unknown, unknown, { academic_year_id?: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await ofertaDeAdmision(req.query.academic_year_id || undefined) });
});
