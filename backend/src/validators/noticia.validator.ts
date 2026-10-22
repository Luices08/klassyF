import Joi from 'joi';
import { ESTADOS_USUARIO } from '../constants/enums';
import {
  ALCANCES_NOTICIA,
  MAX_CARACTERES_CONTENIDO_NOTICIA,
  MAX_CARACTERES_PORTADA,
  MAX_DESCRIPCION_NOTICIA,
  MAX_LUGAR_NOTICIA,
  MAX_NOMBRE_CATEGORIA,
  MAX_SUBTITULO_NOTICIA,
  MAX_TITULO_NOTICIA,
  ROLES_DESTINO_NOTICIA,
  TAMANOS_MOSAICO,
  TONOS_CATEGORIA,
} from '../constants/noticias';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const ids = Joi.array().items(objectId).max(100).unique();

// Lo común de crear y editar: al editar todo es opcional. Las fechas de calendario van `AAAA-MM-DD` o como instante ISO (a medianoche UTC las guarda el modelo).
const campos = {
  titulo: Joi.string().trim().min(3).max(MAX_TITULO_NOTICIA),
  subtitulo: Joi.string().trim().allow('').max(MAX_SUBTITULO_NOTICIA),
  descripcion: Joi.string().trim().min(3).max(MAX_DESCRIPCION_NOTICIA),
  // El cuerpo con formato: el servidor lo limpia y de él deriva la descripción. Las imágenes del cuerpo viajan dentro del texto.
  contenido_html: Joi.string().allow('').max(MAX_CARACTERES_CONTENIDO_NOTICIA),
  tamano_mosaico: Joi.string().valid(...TAMANOS_MOSAICO),
  enfoque_x: Joi.number().min(0).max(100),
  enfoque_y: Joi.number().min(0).max(100),
  // La portada como data URI: el servidor confirma por la firma de bytes que sea una imagen de verdad.
  portada: Joi.string().max(MAX_CARACTERES_PORTADA).pattern(/^data:image\/(png|jpeg|webp);base64,/).messages({ 'string.pattern.base': 'La portada debe ser una imagen PNG, JPG o WEBP.' }),
  categoria_id: objectId,
  fecha_inicio: Joi.date().iso().allow(null),
  fecha_fin: Joi.date().iso().allow(null),
  hora: Joi.string().pattern(/^(([01]\d|2[0-3]):[0-5]\d)?$/).allow('').messages({ 'string.pattern.base': 'La hora debe tener el formato HH:MM.' }),
  lugar: Joi.string().trim().allow('').max(MAX_LUGAR_NOTICIA),
  afecta_clases: Joi.boolean(),
  roles_destino: Joi.array().items(Joi.string().valid(...ROLES_DESTINO_NOTICIA)).min(1).unique(),
  sedes_ids: ids,
  grados_ids: ids,
  grupos_ids: ids,
  publicar_desde: Joi.date().iso(),
  vence_el: Joi.date().iso().allow(null),
  fijada: Joi.boolean(),
};

export const crear: ValidationSchema = {
  // El cuerpo llega como texto con formato o, como antes, como descripción; y toda noticia lleva portada.
  body: Joi.object({ ...campos, titulo: campos.titulo.required(), categoria_id: objectId.required(), portada: campos.portada.required() }).or('descripcion', 'contenido_html'),
};

export const actualizar: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object(campos).min(1),
};

export const porId: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const mias: ValidationSchema = {
  query: Joi.object({ limite: Joi.number().integer().min(1).max(100) }),
};

// --- Categorías ---

export const listarCategorias: ValidationSchema = {
  query: Joi.object({ todas: Joi.boolean() }),
};

export const crearCategoria: ValidationSchema = {
  body: Joi.object({ nombre: Joi.string().trim().min(2).max(MAX_NOMBRE_CATEGORIA).required(), tono: Joi.string().valid(...TONOS_CATEGORIA) }),
};

export const actualizarCategoria: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    nombre: Joi.string().trim().min(2).max(MAX_NOMBRE_CATEGORIA),
    tono: Joi.string().valid(...TONOS_CATEGORIA),
    estado: Joi.string().valid(...ESTADOS_USUARIO),
  }).min(1),
};

// --- Habilitaciones de docentes ---

export const otorgarHabilitacion: ValidationSchema = {
  body: Joi.object({
    docente_id: objectId.required(),
    alcance_maximo: Joi.string().valid(...ALCANCES_NOTICIA).required(),
    categorias_ids: ids.default([]),
  }),
};

export const actualizarHabilitacion: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ alcance_maximo: Joi.string().valid(...ALCANCES_NOTICIA), categorias_ids: ids }).min(1),
};
