import Joi from 'joi';
import {
  CLAVES_CERTIFICADO,
  ELEMENTOS_AUTENTICACION,
  ESTADOS_CERTIFICADO,
  MAX_DEPENDENCIAS_PAZ_Y_SALVO,
  MAX_DESTINATARIO,
  MAX_MOTIVO_ANULACION,
  MAX_NOMBRE_DEPENDENCIA,
  MODOS_ELEMENTO,
} from '../constants/certificados';
import { ESTILOS_BLOQUE, MAX_BLOQUES, MAX_DESTINATARIOS, MAX_TEXTO_BLOQUE } from '../constants/plantillasCertificado';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const tipo = Joi.string().valid(...CLAVES_CERTIFICADO);
const elemento = Joi.string().valid(...ELEMENTOS_AUTENTICACION);

// Lo único que viaja desde la pantalla son ids y opciones: el contenido del documento lo arma el servidor con lo que ya conoce.
const cuerpoExpedicion = Joi.object({
  enrollment_id: objectId.required(),
  tipo: tipo.required(),
  // El destinatario/motivo se elige de un selector por documento; `otro` es el texto cuando elige «Otro».
  destinatario: Joi.object({ clave: Joi.string().trim().max(40).required(), otro: Joi.string().trim().max(MAX_DESTINATARIO).allow('', null) }).allow(null),
  // Solo paz y salvo: las claves de las dependencias que se confirmaron sin pendientes.
  dependencias: Joi.array().items(Joi.string().trim().max(40)).max(MAX_DEPENDENCIAS_PAZ_Y_SALVO),
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
    paz_y_salvo: Joi.object({
      dependencias: Joi.array()
        .items(Joi.object({ clave: Joi.string().trim().max(40), nombre: Joi.string().trim().min(2).max(MAX_NOMBRE_DEPENDENCIA).required(), activa: Joi.boolean().required() }))
        .max(MAX_DEPENDENCIAS_PAZ_Y_SALVO)
        .required(),
    }),
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

// --- Plantillas (M26): el contenido llega completo; el servicio revisa los mínimos del documento ---

const bloquePlantilla = Joi.object({
  id: Joi.string().trim().max(40).required(),
  estilo: Joi.string().valid(...ESTILOS_BLOQUE).required(),
  texto: Joi.string().allow('').max(MAX_TEXTO_BLOQUE).required(),
  condicion: Joi.object({ variable: Joi.string().trim().max(60).required(), tipo: Joi.string().valid('HAY', 'NO_HAY').required() }).allow(null).required(),
  activo: Joi.boolean().required(),
});

const contenidoPlantilla = Joi.object({
  titulo: Joi.string().trim().max(100).required(),
  bloques: Joi.array().items(bloquePlantilla).max(MAX_BLOQUES).required(),
  destinatarios: Joi.array()
    .items(Joi.object({ clave: Joi.string().trim().max(40).required(), etiqueta: Joi.string().trim().max(80).required(), frase: Joi.string().trim().max(200).required() }))
    .max(MAX_DESTINATARIOS)
    .required(),
  frase_otro: Joi.string().trim().max(200).required(),
  vigencia_dias: Joi.number().integer().min(1).max(365).allow(null).required(),
});

const conTipo = Joi.object({ tipo: tipo.required() });

export const plantillaConTipo: ValidationSchema = { params: conTipo };
export const publicarPlantilla: ValidationSchema = { params: conTipo, body: contenidoPlantilla.keys({ nota: Joi.string().trim().allow('').max(300) }) };
export const vistaPreviaPlantilla: ValidationSchema = { params: conTipo, body: contenidoPlantilla };
