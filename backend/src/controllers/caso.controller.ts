import { NextFunction, Request, Response } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { EstadoCaso, TipoSituacion } from '../constants/convivencia';
import { EstadoUsuario } from '../constants/enums';
import validate from '../middlewares/validate.middleware';
import * as casoService from '../services/caso.service';
import * as catalogoService from '../services/casoCatalogo.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';
import { coleccionesRegistroCaso, esquemaDeRegistro } from '../validators/caso.validator';
import * as v from '../validators/caso.validator';

interface IdParams extends ParamsDictionary {
  id: string;
}

const actor = (req: { user?: { _id: unknown }; ip?: string }) => ({ usuarioId: req.user!._id as string, ip: req.ip });

// --- Catálogos ---

export const listarCatalogosCaso = catchAsync<unknown, unknown, unknown, ParsedQs & { incluir_inactivos?: string }>(async (req, res) => {
  const catalogos = await catalogoService.listarCatalogosCaso(String(req.query.incluir_inactivos) === 'true');
  res.status(200).json({ success: true, data: catalogos });
});

export const crearMedida = catchAsync<unknown, unknown, catalogoService.DatosMedida>(async (req, res) => {
  res.status(201).json({ success: true, data: await catalogoService.crearMedida(req.body, actor(req)) });
});
export const actualizarMedida = catchAsync<IdParams, unknown, Partial<catalogoService.DatosMedida>>(async (req, res) => {
  res.status(200).json({ success: true, data: await catalogoService.actualizarMedida(req.params.id, req.body, actor(req)) });
});
export const cambiarEstadoMedida = catchAsync<IdParams, unknown, { estado: EstadoUsuario }>(async (req, res) => {
  res.status(200).json({ success: true, data: await catalogoService.cambiarEstadoMedida(req.params.id, req.body.estado, actor(req)) });
});
export const eliminarMedida = catchAsync<IdParams>(async (req, res) => {
  await catalogoService.eliminarMedida(req.params.id, actor(req));
  res.status(200).json({ success: true });
});

export const crearEntidad = catchAsync<unknown, unknown, catalogoService.DatosEntidad>(async (req, res) => {
  res.status(201).json({ success: true, data: await catalogoService.crearEntidad(req.body, actor(req)) });
});
export const actualizarEntidad = catchAsync<IdParams, unknown, Partial<catalogoService.DatosEntidad>>(async (req, res) => {
  res.status(200).json({ success: true, data: await catalogoService.actualizarEntidad(req.params.id, req.body, actor(req)) });
});
export const cambiarEstadoEntidad = catchAsync<IdParams, unknown, { estado: EstadoUsuario }>(async (req, res) => {
  res.status(200).json({ success: true, data: await catalogoService.cambiarEstadoEntidad(req.params.id, req.body.estado, actor(req)) });
});
export const eliminarEntidad = catchAsync<IdParams>(async (req, res) => {
  await catalogoService.eliminarEntidad(req.params.id, actor(req));
  res.status(200).json({ success: true });
});

export const guardarProtocolo = catchAsync<{ tipo: TipoSituacion } & ParamsDictionary, unknown, { pasos: { nombre: string; obligatorio: boolean }[] }>(
  async (req, res) => {
    res.status(200).json({ success: true, data: await catalogoService.guardarProtocolo(req.params.tipo, req.body.pasos, actor(req)) });
  }
);

// --- Casos ---

export const abrirCaso = catchAsync<unknown, unknown, casoService.AbrirCasoInput>(async (req, res) => {
  res.status(201).json({ success: true, data: await casoService.abrirCaso(req.body, req.user!, req.ip) });
});

export const listarCasos = catchAsync<unknown, unknown, unknown, ParsedQs & { estado?: EstadoCaso; tipo_situacion?: TipoSituacion; sede_id?: string; pagina?: number; limite?: number }>(
  async (req, res) => {
    const { pagina, limite, ...filtros } = req.query;
    const resultado = await casoService.listarCasos(req.user!, filtros, { pagina: Number(pagina ?? 1), limite: Number(limite ?? 20) });
    res.status(200).json({ success: true, ...resultado });
  }
);

export const obtenerCaso = catchAsync<IdParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await casoService.obtenerCaso(req.params.id, req.user!, req.ip) });
});

export const cambiarEstadoCaso = catchAsync<IdParams, unknown, { estado: EstadoCaso }>(async (req, res) => {
  res.status(200).json({ success: true, data: await casoService.cambiarEstadoCaso(req.params.id, req.body.estado, req.user!, req.ip) });
});

export const reclasificarCaso = catchAsync<IdParams, unknown, { tipo_situacion: TipoSituacion; motivo: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await casoService.reclasificarCaso(req.params.id, req.body.tipo_situacion, req.body.motivo, req.user!, req.ip) });
});

export const registrarAtencion = catchAsync<IdParams, unknown, { descripcion: string; hubo_dano?: boolean }>(async (req, res) => {
  res.status(200).json({ success: true, data: await casoService.registrarAtencion(req.params.id, req.body, req.user!, req.ip) });
});

interface PasoParams extends IdParams {
  pasoId: string;
}
export const actualizarPaso = catchAsync<PasoParams, unknown, { estado: 'PENDIENTE' | 'CUMPLIDO' | 'NO_APLICA'; nota?: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await casoService.actualizarPaso(req.params.id, req.params.pasoId, req.body, req.user!, req.ip) });
});

interface ColeccionParams extends IdParams {
  coleccion: string;
}

/** Cada colección de registros del proceso tiene su propio esquema Joi; se elige por la ruta. */
export function validarRegistroDeCaso(req: Request, res: Response, next: NextFunction) {
  const esquema = coleccionesRegistroCaso.includes(req.params.coleccion ?? '') ? esquemaDeRegistro(req.params.coleccion ?? '') : undefined;
  if (!esquema) return next(new ApiError(404, 'Tipo de registro no válido.'));
  return validate({ params: v.obtenerCaso.params, body: esquema })(req, res, next);
}

export const agregarRegistroCaso = catchAsync<ColeccionParams, unknown, casoService.DatosRegistroCaso>(async (req, res) => {
  const coleccion = req.params.coleccion as casoService.ColeccionRegistroCaso;
  res.status(201).json({ success: true, data: await casoService.agregarRegistroCaso(req.params.id, coleccion, req.body, req.user!, req.ip) });
});

export const registrarDecision = catchAsync<IdParams, unknown, { motivacion: string; descriptores_ids?: string[] }>(async (req, res) => {
  res.status(200).json({ success: true, data: await casoService.registrarDecision(req.params.id, req.body, req.user!, req.ip) });
});

export const cerrarCaso = catchAsync<IdParams, unknown, casoService.CerrarCasoInput>(async (req, res) => {
  res.status(200).json({ success: true, data: await casoService.cerrarCaso(req.params.id, req.body, req.user!, req.ip) });
});

export const reabrirCaso = catchAsync<IdParams, unknown, { motivo: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await casoService.reabrirCaso(req.params.id, req.body.motivo, req.user!, req.ip) });
});

export const anularCaso = catchAsync<IdParams, unknown, { motivo: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await casoService.anularCaso(req.params.id, req.body.motivo, req.user!, req.ip) });
});

export const declararImpedimento = catchAsync<IdParams, unknown, { motivo: string; usuario_id?: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await casoService.declararImpedimento(req.params.id, req.body, req.user!, req.ip) });
});
