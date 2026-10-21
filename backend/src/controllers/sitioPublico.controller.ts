import { ConfiguracionSitio } from '../constants/sitioPublico';
import * as sitioService from '../services/sitioPublico.service';
import catchAsync from '../utils/catchAsync';

const contexto = (req: { user?: { _id: unknown }; ip?: string }) => ({ usuarioId: req.user!._id as string, ip: req.ip ?? null });

export const verParaAdministrar = catchAsync(async (_req, res) => {
  res.status(200).json({ success: true, data: await sitioService.obtenerParaAdministrar() });
});

export const guardarConfiguracion = catchAsync<unknown, unknown, ConfiguracionSitio>(async (req, res) => {
  await sitioService.guardarConfiguracion(req.body, contexto(req));
  res.status(200).json({ success: true, data: await sitioService.obtenerParaAdministrar() });
});

export const agregarImagen = catchAsync(async (req, res) => {
  await sitioService.agregarImagen(req.file, contexto(req));
  res.status(201).json({ success: true, data: await sitioService.obtenerParaAdministrar() });
});

export const quitarImagen = catchAsync<{ id: string }>(async (req, res) => {
  await sitioService.quitarImagen(req.params.id, contexto(req));
  res.status(200).json({ success: true, data: await sitioService.obtenerParaAdministrar() });
});

/** Pública: la página del colegio se dibuja antes de iniciar sesión. */
export const verSitioPublico = catchAsync(async (_req, res) => {
  res.status(200).json({ success: true, data: await sitioService.obtenerVistaPublica() });
});

export const verImagenPublica = catchAsync<{ id: string }>(async (req, res) => {
  const { mime, datos } = await sitioService.leerImagenPublica(req.params.id);
  // Reemplazar una imagen es quitarla y agregar otra (id nuevo), así que cachear un día no muestra una vieja.
  res.setHeader('Cache-Control', 'public, max-age=86400');
  // helmet pone `same-origin` por defecto: con el frontend en otro origen (desarrollo) el navegador bloquearía la imagen.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.type(mime).send(datos);
});
