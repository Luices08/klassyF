import Joi from 'joi';
import {
  CLAVES_TEXTOS_BOLETIN,
  ESCUDO_TAMANO_MAXIMO,
  ESCUDO_TAMANO_MINIMO,
  FUENTES_BOLETIN,
  MAX_FIRMAS_BOLETIN,
  MAX_LINEAS_COMPROMISOS,
  MAX_LONGITUD_APOYO_BOLETIN,
  MAX_LONGITUD_TEXTO_BOLETIN,
  MAX_OPCIONES_PROMOCION,
  MIN_LINEAS_COMPROMISOS,
  MAX_LONGITUD_CANAL_RECLAMACIONES,
  MAX_LONGITUD_FRASE,
  MAX_LONGITUD_OBSERVACION,
  MAX_LONGITUD_PIE_BOLETIN,
  MAX_LONGITUD_TITULO_BOLETIN,
  PAPELES_BOLETIN,
  POSICIONES_ESCUDO,
  SECCIONES_BOLETIN,
  TAMANOS_TEXTO_BOLETIN,
  TIPOS_FRASE_BOLETIN,
} from '../constants/boletin';
import { NIVELES_DESEMPENO } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const texto = (max: number) => Joi.string().trim().allow('').max(max);

/** El diseño del boletín. Todo es opcional: lo que falte lo completa el servidor con el diseño original (`completarPlantilla`). */
const plantilla = Joi.object({
  titulo: texto(MAX_LONGITUD_TITULO_BOLETIN),
  subtitulo: texto(MAX_LONGITUD_TITULO_BOLETIN),
  mostrar_datos_institucion: Joi.boolean(),
  mostrar_sede_jornada: Joi.boolean(),
  escudo: Joi.object({
    mostrar: Joi.boolean(),
    posicion: Joi.string().valid(...POSICIONES_ESCUDO),
    tamano: Joi.number().integer().min(ESCUDO_TAMANO_MINIMO).max(ESCUDO_TAMANO_MAXIMO),
    // El servidor confirma después que sea un PNG/JPG real y su peso (validarEscudo).
    url: Joi.string().dataUri().max(800_000).allow(null),
  }),
  color_acento: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/),
  papel: Joi.string().valid(...PAPELES_BOLETIN),
  secciones: Joi.array().items(
    Joi.object({ clave: Joi.string().valid(...SECCIONES_BOLETIN).required(), titulo: texto(MAX_LONGITUD_TITULO_BOLETIN), visible: Joi.boolean() })
  ).max(SECCIONES_BOLETIN.length),
  fuente: Joi.string().valid(...FUENTES_BOLETIN),
  tamano_texto: Joi.string().valid(...TAMANOS_TEXTO_BOLETIN),
  estudiante: Joi.object({ documento: Joi.boolean(), grado: Joi.boolean(), grupo: Joi.boolean(), inasistencias: Joi.boolean(), promedio: Joi.boolean() }),
  asignaturas: Joi.object({
    nota: Joi.boolean(),
    desempeno: Joi.boolean(),
    fallas: Joi.boolean(),
    nota_area: Joi.boolean(),
    componentes: Joi.boolean(),
    descripcion: Joi.boolean(),
    recomendacion: Joi.boolean(),
    observacion: Joi.boolean(),
  }),
  rotulos: Joi.object({ componentes: texto(60), descripcion: texto(60), recomendacion: texto(60), observacion: texto(60) }),
  // Cada texto fijo del documento es del colegio; solo se aceptan las claves que el PDF conoce.
  textos: Joi.object(Object.fromEntries(CLAVES_TEXTOS_BOLETIN.map((clave) => [clave, texto(MAX_LONGITUD_TEXTO_BOLETIN)]))),
  texto_apoyo: texto(MAX_LONGITUD_APOYO_BOLETIN),
  compromisos_lineas: Joi.number().integer().min(MIN_LINEAS_COMPROMISOS).max(MAX_LINEAS_COMPROMISOS),
  promocion_opciones: Joi.array().items(texto(40)).max(MAX_OPCIONES_PROMOCION),
  firmas: Joi.array()
    .items(Joi.object({ cargo: texto(80), nombre: texto(80), usa_director_grupo: Joi.boolean() }))
    .max(MAX_FIRMAS_BOLETIN),
  pie_texto: texto(MAX_LONGITUD_PIE_BOLETIN),
});

/** La vista previa del diseño que se está editando (aún sin guardar). Sin cuerpo, se dibuja el diseño guardado. */
export const muestraPdf: ValidationSchema = {
  body: Joi.object({ plantilla }),
};

export const actualizarConfiguracion: ValidationSchema = {
  body: Joi.object({
    canal_reclamaciones: Joi.string().trim().allow('').max(MAX_LONGITUD_CANAL_RECLAMACIONES),
    mostrar_puesto: Joi.boolean(),
    incluir_corte_en_retiro: Joi.boolean(),
    exigir_paz_y_salvo_en_retiro: Joi.boolean(),
    plantilla,
    entregas: Joi.array().items(
      Joi.object({
        academic_year_id: objectId.required(),
        periodo_numero: Joi.number().integer().min(1).max(12).required(),
        fecha_entrega: Joi.date().required(),
      })
    ),
  }).min(1),
};

export const guardarFrase: ValidationSchema = {
  body: Joi.object({
    nivel: Joi.string().valid(...NIVELES_DESEMPENO).required(),
    tipo: Joi.string().valid(...TIPOS_FRASE_BOLETIN).required(),
    texto: Joi.string().trim().allow('').max(MAX_LONGITUD_FRASE).required(),
  }),
};

export const listarObservaciones: ValidationSchema = {
  query: Joi.object({
    teacher_assignment_id: objectId.required(),
    periodo_numero: Joi.number().integer().min(1).max(12).required(),
  }),
};

export const guardarObservaciones: ValidationSchema = {
  body: Joi.object({
    teacher_assignment_id: objectId.required(),
    periodo_numero: Joi.number().integer().min(1).max(12).required(),
    observaciones: Joi.array()
      .items(Joi.object({ student_id: objectId.required(), texto: Joi.string().trim().allow('').max(MAX_LONGITUD_OBSERVACION).required() }))
      .min(1)
      .max(200)
      .required(),
  }),
};

const referenciaPublicacion = {
  group_id: objectId.required(),
  academic_year_id: objectId.required(),
  periodo_numero: Joi.number().integer().min(1).max(12).required(),
};

export const obtenerPublicacion: ValidationSchema = {
  query: Joi.object(referenciaPublicacion),
};

export const publicarGrupo: ValidationSchema = {
  body: Joi.object({ ...referenciaPublicacion, publicado: Joi.boolean().required() }),
};

export const accesoEstudiante: ValidationSchema = {
  body: Joi.object({
    ...referenciaPublicacion,
    student_id: objectId.required(),
    // null = quitar la excepción y volver a lo que decidió el grupo.
    permitir: Joi.boolean().allow(null).required(),
  }),
};
