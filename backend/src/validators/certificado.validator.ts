import Joi from 'joi';
import { CLAVES_CERTIFICADO, ELEMENTOS_AUTENTICACION, ESTADOS_CERTIFICADO, MAX_DESTINATARIO, MAX_MOTIVO_ANULACION, MODOS_ELEMENTO } from '../constants/certificados';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const tipo = Joi.string().valid(...CLAVES_CERTIFICADO);
const elemento = Joi.string().valid(...ELEMENTOS_AUTENTICACION);

// Lo único que viaja desde la pantalla son ids y opciones: el contenido del documento lo arma el servidor con lo que ya conoce.
const cuerpoExpedicion = Joi.object({
  enrollment_id: objectId.required(),
  tipo: tipo.required(),
  destinatario: Joi.string().trim().max(MAX_DESTINATARIO).allow('', null),
  firmas: Joi.object(Object.fromEntries(ELEMENTOS_AUTENTICACION.map((e) => [e, Joi.boolean()]))),
});

export const expedir: ValidationSchema = { body: cuerpoExpedicion };
export const vistaPrevia: ValidationSchema = { body: cuerpoExpedicion };

export const matriculasDelEstudiante: ValidationSchema = { params: Joi.object({ studentId: objectId.required() }) };

export const listar: ValidationSchema = {
  query: Joi.object({
    student_id: objectId,
    tipo,
    estado: Joi.string().valid(...ESTADOS_CERTIFICADO),
    pagina: Joi.number().integer().min(1).default(1),
    limite: Joi.number().integer().min(1).max(100).default(20),
  }),
};

export const conId: ValidationSchema = { params: Joi.object({ id: objectId.required() }) };

export const anular: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ motivo: Joi.string().trim().min(5).max(MAX_MOTIVO_ANULACION).required() }),
};

const firmante = Joi.object({ usuario_id: objectId.allow(null), cargo: Joi.string().trim().min(2).max(80) });

export const actualizarConfiguracion: ValidationSchema = {
  body: Joi.object({
    rectoria: firmante,
    secretaria: firmante,
    permitir_firma_rectoria_a_secretaria: Joi.boolean(),
    politica: Joi.object(
      Object.fromEntries(CLAVES_CERTIFICADO.map((c) => [c, Joi.object(Object.fromEntries(ELEMENTOS_AUTENTICACION.map((e) => [e, Joi.string().valid(...MODOS_ELEMENTO)])))]))
    ),
  }),
};

export const conElemento: ValidationSchema = { params: Joi.object({ elemento: elemento.required() }) };

// Verificación pública: por el token del QR, o por código + clave impresos en el documento.
export const verificarPublico: ValidationSchema = {
  query: Joi.object({
    token: Joi.string().trim().pattern(/^[A-Za-z0-9_-]{16,64}$/),
    codigo: Joi.string().trim().max(30),
    clave: Joi.string().trim().max(20),
  })
    .or('token', 'codigo')
    .with('codigo', 'clave'),
};
