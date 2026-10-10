import * as asistenteService from '../services/asistente.service';
import { DestinoAsistente } from '../utils/asistente';
import catchAsync from '../utils/catchAsync';

interface OrientarBody {
  pregunta: string;
  destinos: DestinoAsistente[];
}

export const orientar = catchAsync<unknown, unknown, OrientarBody>(async (req, res) => {
  const data = await asistenteService.orientarNavegacion(req.body.pregunta, req.body.destinos);
  res.status(200).json({ success: true, data });
});
