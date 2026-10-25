import { Types } from 'mongoose';
import { TIPOS_IMAGEN_INSTITUCIONAL, MAX_BYTES_IMAGEN_INSTITUCIONAL } from '../constants/imagenesInstitucionales';
import {
  CONFIGURACION_SITIO_INICIAL,
  ConfiguracionSitio,
  FUENTES_SITIO,
  MAX_IMAGENES_SLIDER,
  PLANTILLAS_SITIO,
  SECCIONES_SITIO,
  plantillaDe,
} from '../constants/sitioPublico';
import ImagenSitio from '../models/imagenSitio.model';
import SitioPublico from '../models/sitioPublico.model';
import ApiError from '../utils/ApiError';
import { detectarFirmaArchivo } from '../utils/firmasArchivo';
import { registrarEvento } from './audit.service';

interface Contexto {
  usuarioId: Types.ObjectId | string;
  ip?: string | null;
}

export interface VistaSitio extends ConfiguracionSitio {
  /** Solo si la plantilla elegida tiene carrusel; `version` arma la URL para que el navegador no use una imagen vieja. */
  imagenes: { id: string; version: number }[];
}

function aConfiguracion(doc: { toObject: () => ConfiguracionSitio } | null): ConfiguracionSitio {
  if (!doc) return structuredClone(CONFIGURACION_SITIO_INICIAL);
  const { plantilla, logo_posicion, menu_posicion, tipografia, secciones } = doc.toObject();
  // Una sección agregada al sistema después de guardar la configuración aparece al final, visible.
  const faltantes = SECCIONES_SITIO.filter((c) => !secciones.some((s) => s.clave === c)).map((clave) => ({ clave, visible: true }));
  return { plantilla, logo_posicion, menu_posicion, tipografia, secciones: [...secciones, ...faltantes] };
}

async function listarImagenes() {
  const imagenes = await ImagenSitio.find().sort({ orden: 1 }).select('actualizada_en');
  return imagenes.map((i) => ({ id: String(i._id), version: i.actualizada_en.getTime() }));
}

export async function leerConfiguracion(): Promise<ConfiguracionSitio> {
  return aConfiguracion(await SitioPublico.findOne());
}

/** Lo que dibuja la página pública. Sin plantilla con carrusel no se exponen imágenes. */
export async function obtenerVistaPublica(): Promise<VistaSitio> {
  const configuracion = await leerConfiguracion();
  const imagenes = plantillaDe(configuracion.plantilla)?.slider ? await listarImagenes() : [];
  return { ...configuracion, imagenes };
}

/** Lo que usa el módulo de administración: la configuración, todas las imágenes cargadas y el catálogo de plantillas. */
export async function obtenerParaAdministrar() {
  return {
    configuracion: await leerConfiguracion(),
    imagenes: await listarImagenes(),
    plantillas: PLANTILLAS_SITIO,
    fuentes: FUENTES_SITIO,
    max_imagenes: MAX_IMAGENES_SLIDER,
  };
}

export async function guardarConfiguracion(entrada: ConfiguracionSitio, { usuarioId, ip }: Contexto): Promise<void> {
  const plantilla = plantillaDe(entrada.plantilla);
  if (!plantilla) throw new ApiError(400, 'La plantilla elegida no existe.');
  if (!plantilla.logo.includes(entrada.logo_posicion)) throw new ApiError(400, `La plantilla «${plantilla.nombre}» no admite esa ubicación del logo.`);
  if (!plantilla.menu.includes(entrada.menu_posicion)) throw new ApiError(400, `La plantilla «${plantilla.nombre}» no admite esa ubicación del menú.`);
  const claves = entrada.secciones.map((s) => s.clave);
  if (new Set(claves).size !== claves.length || claves.length !== SECCIONES_SITIO.length) {
    throw new ApiError(400, 'Cada sección debe aparecer una sola vez.');
  }

  const doc = await SitioPublico.findOneAndUpdate(
    {},
    { ...entrada, actualizado_en: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
  await registrarEvento({ usuario_id: usuarioId, accion: 'SITIO_PUBLICO_ACTUALIZADO', entidad: 'SitioPublico', entidad_id: doc._id, detalle: `Plantilla ${entrada.plantilla}`, ip });
}

export async function agregarImagen(archivo: Express.Multer.File | undefined, { usuarioId, ip }: Contexto): Promise<void> {
  if (!archivo) throw new ApiError(400, 'Adjunta la imagen (PNG, JPG o WEBP).');
  if (archivo.size > MAX_BYTES_IMAGEN_INSTITUCIONAL) throw new ApiError(400, 'La imagen supera el tamaño máximo permitido (2 MB).');
  const firma = detectarFirmaArchivo(archivo.mimetype, archivo.buffer);
  if (!firma || !(TIPOS_IMAGEN_INSTITUCIONAL as readonly string[]).includes(firma.mimetype)) {
    throw new ApiError(400, 'La imagen debe ser un PNG, JPG o WEBP válido.');
  }
  if ((await ImagenSitio.countDocuments()) >= MAX_IMAGENES_SLIDER) {
    throw new ApiError(409, `El carrusel admite hasta ${MAX_IMAGENES_SLIDER} imágenes. Quita una para agregar otra.`);
  }
  const ultima = await ImagenSitio.findOne().sort({ orden: -1 }).select('orden');
  const imagen = await ImagenSitio.create({ orden: (ultima?.orden ?? 0) + 1, mime: firma.mimetype, datos: archivo.buffer });
  await registrarEvento({ usuario_id: usuarioId, accion: 'SITIO_PUBLICO_IMAGEN_AGREGADA', entidad: 'ImagenSitio', entidad_id: imagen._id, ip });
}

export async function quitarImagen(id: string, { usuarioId, ip }: Contexto): Promise<void> {
  const { deletedCount } = await ImagenSitio.deleteOne({ _id: id });
  if (deletedCount === 0) throw new ApiError(404, 'La imagen no existe.');
  await registrarEvento({ usuario_id: usuarioId, accion: 'SITIO_PUBLICO_IMAGEN_QUITADA', entidad: 'ImagenSitio', entidad_id: id, ip });
}

/**
 * Pública. Se sirve por id aunque la plantilla guardada no tenga carrusel: el administrador las ve en la vista previa antes de guardar,
 * y la página pública solo conoce los ids que `obtenerVistaPublica` le entrega (ids no adivinables, y solo con carrusel).
 */
export async function leerImagenPublica(id: string): Promise<{ mime: string; datos: Buffer }> {
  const imagen = await ImagenSitio.findById(id);
  if (!imagen) throw new ApiError(404, 'No hay imagen cargada.');
  return { mime: imagen.mime, datos: imagen.datos };
}
