import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import * as configuracionService from '../services/configuracionRecuperaciones.service';
import * as recuperacionService from '../services/recuperacion.service';
import catchAsync from '../utils/catchAsync';
import { componentesEfectivos } from '../utils/siee';

interface AnioParams extends ParamsDictionary {
  academic_year_id: string;
}

export const obtenerPolitica = catchAsync<AnioParams>(async (req, res) => {
  const { anio, politica } = await configuracionService.obtenerPoliticaDelAnio(req.params.academic_year_id);
  // Los bloques del molde de notas del año (M12) son las opciones donde puede entrar la recuperación.
  const bloques = componentesEfectivos(anio).map((b) => ({ clave: b.clave, nombre: b.nombre, porcentaje: b.porcentaje }));
  res.status(200).json({ success: true, data: { ...politica.toObject(), bloques_molde: bloques } });
});

export const actualizarPolitica = catchAsync<AnioParams, unknown, configuracionService.CambiosPoliticaRecuperacion>(async (req, res) => {
  const politica = await configuracionService.actualizarPolitica(req.params.academic_year_id, req.body, req.user!, req.ip);
  res.status(200).json({ success: true, data: politica });
});

export const listarCandidatos = catchAsync<unknown, unknown, unknown, ParsedQs & recuperacionService.FiltrosCandidatos>(async (req, res) => {
  const data = await recuperacionService.listarCandidatos(req.query, req.user!);
  res.status(200).json({ success: true, data });
});

export const registrarIntento = catchAsync<unknown, unknown, recuperacionService.RegistrarIntentoInput>(async (req, res) => {
  const recuperacion = await recuperacionService.registrarIntento(req.body, req.user!, req.ip);
  res.status(201).json({ success: true, data: recuperacion });
});
