import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { EstadoUsuario } from '../constants/enums';
import { ROLES } from '../constants/roles';
import * as catalogoService from '../services/convivenciaCatalogo.service';
import * as observacionService from '../services/observacion.service';
import catchAsync from '../utils/catchAsync';

interface IdParams extends ParamsDictionary {
  id: string;
}

interface EstudianteParams extends ParamsDictionary {
  studentId: string;
}

const actor = (req: { user?: { _id: unknown }; ip?: string }) => ({
  usuarioId: req.user!._id as string,
  ip: req.ip,
});

// --- Catálogo y política ---

export const listarCatalogo = catchAsync<unknown, unknown, unknown, ParsedQs & { incluir_inactivos?: string }>(
  async (req, res) => {
    // Quien configura ve también lo inactivo; quien solo registra, únicamente lo activo.
    const configura = req.user!.rol === ROLES.ADMIN || req.user!.rol === ROLES.COORDINADOR_CONVIVENCIA;
    const incluirInactivos = configura && String(req.query.incluir_inactivos) === 'true';
    const catalogo = await catalogoService.listarCatalogo(incluirInactivos);
    res.status(200).json({ success: true, data: catalogo });
  }
);

export const crearTipo = catchAsync<unknown, unknown, catalogoService.DatosTipoObservacion>(async (req, res) => {
  res.status(201).json({ success: true, data: await catalogoService.crearTipo(req.body, actor(req)) });
});
export const actualizarTipo = catchAsync<IdParams, unknown, Partial<catalogoService.DatosTipoObservacion>>(async (req, res) => {
  res.status(200).json({ success: true, data: await catalogoService.actualizarTipo(req.params.id, req.body, actor(req)) });
});
export const cambiarEstadoTipo = catchAsync<IdParams, unknown, { estado: EstadoUsuario }>(async (req, res) => {
  res.status(200).json({ success: true, data: await catalogoService.cambiarEstadoTipo(req.params.id, req.body.estado, actor(req)) });
});
export const eliminarTipo = catchAsync<IdParams>(async (req, res) => {
  await catalogoService.eliminarTipo(req.params.id, actor(req));
  res.status(200).json({ success: true });
});

export const crearCategoria = catchAsync<unknown, unknown, catalogoService.DatosCategoriaDescriptor>(async (req, res) => {
  res.status(201).json({ success: true, data: await catalogoService.crearCategoria(req.body, actor(req)) });
});
export const actualizarCategoria = catchAsync<IdParams, unknown, Partial<catalogoService.DatosCategoriaDescriptor>>(
  async (req, res) => {
    res.status(200).json({ success: true, data: await catalogoService.actualizarCategoria(req.params.id, req.body, actor(req)) });
  }
);
export const cambiarEstadoCategoria = catchAsync<IdParams, unknown, { estado: EstadoUsuario }>(async (req, res) => {
  res.status(200).json({ success: true, data: await catalogoService.cambiarEstadoCategoria(req.params.id, req.body.estado, actor(req)) });
});
export const eliminarCategoria = catchAsync<IdParams>(async (req, res) => {
  await catalogoService.eliminarCategoria(req.params.id, actor(req));
  res.status(200).json({ success: true });
});

export const crearDescriptor = catchAsync<unknown, unknown, catalogoService.DatosDescriptor>(async (req, res) => {
  res.status(201).json({ success: true, data: await catalogoService.crearDescriptor(req.body, actor(req)) });
});
export const actualizarDescriptor = catchAsync<IdParams, unknown, Partial<Omit<catalogoService.DatosDescriptor, 'tipo_id'>>>(
  async (req, res) => {
    res.status(200).json({ success: true, data: await catalogoService.actualizarDescriptor(req.params.id, req.body, actor(req)) });
  }
);
export const cambiarEstadoDescriptor = catchAsync<IdParams, unknown, { estado: EstadoUsuario }>(async (req, res) => {
  res.status(200).json({ success: true, data: await catalogoService.cambiarEstadoDescriptor(req.params.id, req.body.estado, actor(req)) });
});
export const eliminarDescriptor = catchAsync<IdParams>(async (req, res) => {
  await catalogoService.eliminarDescriptor(req.params.id, actor(req));
  res.status(200).json({ success: true });
});

export const obtenerConfiguracion = catchAsync(async (_req, res) => {
  res.status(200).json({ success: true, data: await catalogoService.obtenerConfiguracion() });
});
export const actualizarConfiguracion = catchAsync<unknown, unknown, Partial<catalogoService.DatosConfiguracionConvivencia>>(
  async (req, res) => {
    res.status(200).json({ success: true, data: await catalogoService.actualizarConfiguracion(req.body, actor(req)) });
  }
);

// --- Observaciones ---

export const listarGrupos = catchAsync(async (req, res) => {
  const grupos = await observacionService.gruposAccesibles(req.user!);
  res.status(200).json({ success: true, count: grupos.length, data: grupos });
});

export const buscarEstudiantes = catchAsync<unknown, unknown, unknown, ParsedQs & observacionService.ConsultaEstudiantes>(
  async (req, res) => {
    const estudiantes = await observacionService.buscarEstudiantes(req.user!, req.query);
    res.status(200).json({ success: true, count: estudiantes.length, data: estudiantes });
  }
);

export const registrarObservacion = catchAsync<unknown, unknown, observacionService.RegistrarObservacionInput>(
  async (req, res) => {
    const creadas = await observacionService.registrarObservacion(req.body, req.user!, req.ip);
    res.status(201).json({ success: true, count: creadas.length, data: creadas });
  }
);

export const historialDeEstudiante = catchAsync<EstudianteParams, unknown, unknown, ParsedQs & { pagina?: number; limite?: number }>(
  async (req, res) => {
    const paginacion = { pagina: Number(req.query.pagina ?? 1), limite: Number(req.query.limite ?? 20) };
    const resultado = await observacionService.historialDeEstudiante(req.params.studentId, req.user!, paginacion, req.ip);
    res.status(200).json({ success: true, ...resultado });
  }
);

export const listarMisObservaciones = catchAsync<unknown, unknown, unknown, ParsedQs & { pagina?: number; limite?: number }>(
  async (req, res) => {
    const paginacion = { pagina: Number(req.query.pagina ?? 1), limite: Number(req.query.limite ?? 20) };
    res.status(200).json({ success: true, ...(await observacionService.misObservaciones(req.user!, paginacion)) });
  }
);

export const miObservador = catchAsync(async (req, res) => {
  const datos = await observacionService.miObservador(req.user!, req.ip);
  res.status(200).json({ success: true, count: datos.length, data: datos });
});

export const obtenerObservacion = catchAsync<IdParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await observacionService.obtenerObservacion(req.params.id, req.user!, req.ip) });
});

export const enmendarObservacion = catchAsync<IdParams, unknown, observacionService.EnmendarObservacionInput>(
  async (req, res) => {
    res.status(200).json({ success: true, data: await observacionService.enmendarObservacion(req.params.id, req.body, req.user!, req.ip) });
  }
);

export const anularObservacion = catchAsync<IdParams, unknown, { motivo: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await observacionService.anularObservacion(req.params.id, req.body.motivo, req.user!, req.ip) });
});
