import Joi from 'joi';
import { MAX_DESTINATARIO } from '../constants/certificados';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { claveDocumento, objectId } from './common.validator';

const periodo = Joi.number().integer().min(1).max(12);
const delHijo = Joi.object({ studentId: objectId.required() });

export const conHijo: ValidationSchema = { params: delHijo };

export const notas: ValidationSchema = {
  params: delHijo,
  query: Joi.object({ periodo_numero: periodo.required(), academic_year_id: objectId }),
};

export const notasDelAnio: ValidationSchema = {
  params: delHijo,
  query: Joi.object({ academic_year_id: objectId }),
};

export const inasistencias: ValidationSchema = {
  params: delHijo,
  query: Joi.object({ periodo_numero: periodo, academic_year_id: objectId }),
};

export const subirDocumento: ValidationSchema = {
  params: delHijo.keys({ tipoDocumento: claveDocumento.required() }),
};

// Solo viajan la clave del documento y lo elegido en el selector de destinatario: todo lo demás lo arma el servidor (M26).
export const generarCertificado: ValidationSchema = {
  params: delHijo,
  body: Joi.object({
    tipo: Joi.string().trim().max(40).required(),
    destinatario: Joi.object({ clave: Joi.string().trim().max(40).required(), otro: Joi.string().trim().max(MAX_DESTINATARIO).allow('', null) }).allow(null),
  }),
};

export const certificadoPdf: ValidationSchema = { params: delHijo.keys({ certificadoId: objectId.required() }) };
