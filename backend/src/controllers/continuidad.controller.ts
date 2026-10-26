import { ParsedQs } from 'qs';
import * as continuidad from '../services/continuidad.service';
import catchAsync from '../utils/catchAsync';

type Consulta = ParsedQs & { destino_id: string } & continuidad.FiltrosContinuidad;

export const listar = catchAsync<unknown, unknown, unknown, Consulta>(async (req, res) => {
  const { destino_id, ...filtros } = req.query;
  res.status(200).json({ success: true, data: await continuidad.listarContinuidad(destino_id, filtros, req.user!) });
});

export const registrar = catchAsync<{ studentId: string }, unknown, continuidad.RespuestaDeContinuidad & { destino_id: string }>(async (req, res) => {
  const { destino_id, ...respuesta } = req.body;
  const data = await continuidad.registrarContinuidad(destino_id, req.params.studentId, respuesta, { usuario: req.user!, canal: 'SECRETARIA' }, req.ip);
  res.status(200).json({ success: true, data });
});
