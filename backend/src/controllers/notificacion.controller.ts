import * as anuncios from '../services/anuncio.service';
import * as notificaciones from '../services/notificaciones.service';
import catchAsync from '../utils/catchAsync';

export const resumen = catchAsync(async (req, res) => {
  res.status(200).json({ success: true, data: await notificaciones.resumenNotificaciones(req.user!) });
});

export const listar = catchAsync(async (req, res) => {
  const { solo_no_leidas, limite } = req.query as { solo_no_leidas?: string; limite?: string };
  const data = await notificaciones.listarNotificaciones(req.user!, { solo_no_leidas: solo_no_leidas === 'true', limite: limite ? Number(limite) : undefined });
  res.status(200).json({ success: true, data });
});

export const leer = catchAsync<{ id: string }>(async (req, res) => {
  await notificaciones.marcarLeida(req.user!, req.params.id);
  res.status(200).json({ success: true, data: null });
});

export const leerTodas = catchAsync(async (req, res) => {
  res.status(200).json({ success: true, data: { marcadas: await notificaciones.marcarTodasLeidas(req.user!) } });
});

export const visto = catchAsync(async (req, res) => {
  await notificaciones.marcarVisto(req.user!, req.body.ruta, req.body.pestana ?? '');
  res.status(200).json({ success: true, data: null });
});

// --- Tablero de anuncios ---

export const anunciosParaMi = catchAsync(async (req, res) => {
  res.status(200).json({ success: true, data: await anuncios.anunciosParaMi(req.user!) });
});

export const anunciosGestion = catchAsync(async (_req, res) => {
  res.status(200).json({ success: true, data: await anuncios.listarAnunciosGestion() });
});

export const crearAnuncio = catchAsync(async (req, res) => {
  res.status(201).json({ success: true, data: await anuncios.crearAnuncio(req.body, req.user!, req.ip) });
});

export const actualizarAnuncio = catchAsync<{ id: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await anuncios.actualizarAnuncio(req.params.id, req.body, req.user!, req.ip) });
});

export const archivarAnuncio = catchAsync<{ id: string }>(async (req, res) => {
  await anuncios.archivarAnuncio(req.params.id, req.user!, req.ip);
  res.status(200).json({ success: true, data: null });
});
