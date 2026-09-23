import JornadaOperativa from '../models/jornadaOperativa.model';
import * as jornadaOperativaService from '../services/jornadaOperativa.service';
import { CrearJornadaInput } from '../services/jornadaOperativa.service';
import catchAsync from '../utils/catchAsync';

export const crearJornada = catchAsync<unknown, unknown, CrearJornadaInput>(async (req, res) => {
  const jornada = await jornadaOperativaService.crearJornada(req.body);
  res.status(201).json({ success: true, data: jornada });
});

interface ListarJornadasQuery {
  sede_id?: string;
}

export const listarJornadas = catchAsync<unknown, unknown, unknown, ListarJornadasQuery>(async (req, res) => {
  const filter: Record<string, string> = {};
  if (req.query.sede_id) filter.sede_id = req.query.sede_id;

  const jornadas = await JornadaOperativa.find(filter).populate('sede_id', 'nombre').sort({ nombre: 1 });
  res.status(200).json({ success: true, count: jornadas.length, data: jornadas });
});
