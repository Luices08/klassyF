import { ParsedQs } from 'qs';
import * as categorias from '../services/noticiaCategoria.service';
import * as habilitaciones from '../services/noticiaHabilitacion.service';
import * as imagenes from '../services/noticiaImagen.service';
import * as noticias from '../services/noticia.service';
import catchAsync from '../utils/catchAsync';

const ok = (res: { status: (n: number) => { json: (b: unknown) => void } }, data: unknown, estado = 200) => res.status(estado).json({ success: true, data });

// --- Noticias ---

export const mias = catchAsync<unknown, unknown, unknown, ParsedQs & { limite?: string }>(async (req, res) => {
  ok(res, await noticias.noticiasParaMi(req.user!, req.query.limite ? Number(req.query.limite) : undefined));
});

export const permisos = catchAsync(async (req, res) => ok(res, await noticias.permisosDe(req.user!)));

export const detalle = catchAsync<{ id: string }>(async (req, res) => ok(res, await noticias.detalleDeNoticia(req.params.id, req.user!)));

export const gestion = catchAsync(async (req, res) => ok(res, await noticias.listarGestion(req.user!)));

export const crear = catchAsync<unknown, unknown, noticias.DatosNoticia>(async (req, res) => ok(res, await noticias.crearNoticia(req.body, req.user!, req.ip), 201));

export const actualizar = catchAsync<{ id: string }, unknown, Partial<noticias.DatosNoticia>>(async (req, res) => ok(res, await noticias.actualizarNoticia(req.params.id, req.body, req.user!, req.ip)));

export const archivar = catchAsync<{ id: string }>(async (req, res) => {
  await noticias.archivarNoticia(req.params.id, req.user!, req.ip);
  ok(res, null);
});

// --- Categorías ---

export const listarCategorias = catchAsync<unknown, unknown, unknown, ParsedQs & { todas?: string }>(async (req, res) => {
  // Cualquiera lee las activas para elegir; solo quien las gestiona pide también las desactivadas.
  const gestiona = ['ADMIN', 'COORDINADOR', 'SECRETARIA'].includes(req.user!.rol);
  // El validador ya la convierte a booleano; con o sin conversión debe funcionar.
  ok(res, await categorias.listarCategorias(gestiona && String(req.query.todas) === 'true'));
});

export const crearCategoria = catchAsync<unknown, unknown, { nombre: string; tono?: 'blue' | 'green' | 'orange' | 'red' | 'neutral' }>(async (req, res) => ok(res, await categorias.crearCategoria(req.body, req.user!, req.ip), 201));

export const actualizarCategoria = catchAsync<{ id: string }, unknown, Parameters<typeof categorias.actualizarCategoria>[1]>(async (req, res) => ok(res, await categorias.actualizarCategoria(req.params.id, req.body, req.user!, req.ip)));

export const eliminarCategoria = catchAsync<{ id: string }>(async (req, res) => {
  await categorias.eliminarCategoria(req.params.id, req.user!, req.ip);
  ok(res, null);
});

// --- Habilitaciones de docentes ---

export const listarHabilitaciones = catchAsync(async (req, res) => ok(res, await habilitaciones.listarHabilitaciones(req.user!)));

export const otorgarHabilitacion = catchAsync<unknown, unknown, habilitaciones.DatosHabilitacion>(async (req, res) => ok(res, await habilitaciones.otorgarHabilitacion(req.body, req.user!, req.ip), 201));

export const actualizarHabilitacion = catchAsync<{ id: string }, unknown, Partial<Omit<habilitaciones.DatosHabilitacion, 'docente_id'>>>(async (req, res) =>
  ok(res, await habilitaciones.actualizarHabilitacion(req.params.id, req.body, req.user!, req.ip))
);

export const revocarHabilitacion = catchAsync<{ id: string }>(async (req, res) => {
  await habilitaciones.revocarHabilitacion(req.params.id, req.user!, req.ip);
  ok(res, null);
});

// --- Imagen de la noticia ---

export const subirImagen = catchAsync<{ id: string }>(async (req, res) => ok(res, await imagenes.guardarImagenDeNoticia(req.params.id, req.file, req.user!, req.ip)));

export const quitarImagen = catchAsync<{ id: string }>(async (req, res) => ok(res, await imagenes.quitarImagenDeNoticia(req.params.id, req.user!, req.ip)));

/** Con sesión y solo a quien puede ver la noticia. La URL lleva `?v=<versión>`, así que el navegador puede guardarla sin riesgo de mostrar una imagen vieja. */
export const verImagen = catchAsync<{ id: string }>(async (req, res) => {
  const { mime, datos } = await imagenes.leerImagenDeNoticia(req.params.id, req.user!);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.type(mime).send(datos);
});
