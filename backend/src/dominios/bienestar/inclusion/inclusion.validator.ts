import Joi from 'joi';
import {
  ACTORES_PMI,
  CATEGORIAS_AJUSTE,
  CODIGOS_CATEGORIA_DISCAPACIDAD,
  CLAVES_DOCUMENTO_PIAR,
  DIMENSIONES_TRANSVERSALES,
  EFECTIVIDAD_AJUSTE,
  ESTADOS_EXPEDIENTE,
  ESTADOS_SOLICITUD_APOYO,
  FRECUENCIAS_COMPROMISO,
  MAX_TEXTO_CORTO,
  MAX_TEXTO_LARGO,
  NIVELES_FORMACION_FAMILIAR,
  RESULTADOS_SOLICITUD_APOYO,
  ROLES_FIRMANTE,
  TIPOS_BARRERA,
  TIPOS_EXPEDIENTE,
  TIPOS_NECESIDAD_PLAN_APOYO,
} from './inclusion.constants';
import { ValidationSchema } from '../../../middlewares/validate.middleware';
import { objectId } from '../../../validators/common.validator';

const largo = Joi.string().trim().allow('').max(MAX_TEXTO_LARGO);
const corto = Joi.string().trim().allow('').max(MAX_TEXTO_CORTO);
const siNo = Joi.boolean().allow(null);
const nivel = Joi.string().valid(...NIVELES_FORMACION_FAMILIAR).allow(null);

const idParam = { params: Joi.object({ id: objectId.required() }) };
const paginacion = {
  pagina: Joi.number().integer().min(1).default(1),
  limite: Joi.number().integer().min(1).max(50).default(20),
};

// --- Solicitudes ---

export const crearSolicitud: ValidationSchema = {
  body: Joi.object({
    student_id: objectId.required(),
    motivo_declarado: Joi.string().trim().min(5).max(MAX_TEXTO_CORTO).required(),
    observacion: largo,
  }),
};

export const listarSolicitudes: ValidationSchema = {
  query: Joi.object({ estado: Joi.string().valid(...ESTADOS_SOLICITUD_APOYO), ...paginacion }),
};

export const valorarSolicitud: ValidationSchema = idParam;

export const resolverSolicitud: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({
    resultado: Joi.string()
      .valid(...RESULTADOS_SOLICITUD_APOYO)
      .required(),
    motivo: Joi.string().trim().min(5).max(MAX_TEXTO_CORTO).required(),
    copiar_anterior: Joi.boolean(),
  }),
};

// --- Expedientes ---

export const abrirExpediente: ValidationSchema = {
  body: Joi.object({ student_id: objectId.required(), tipo: Joi.string().valid(...TIPOS_EXPEDIENTE).required(), copiar_anterior: Joi.boolean() }),
};

export const listarExpedientes: ValidationSchema = {
  query: Joi.object({
    estado: Joi.string().valid(...ESTADOS_EXPEDIENTE),
    tipo: Joi.string().valid(...TIPOS_EXPEDIENTE),
    group_id: objectId,
    q: Joi.string().trim().max(60),
    ...paginacion,
  }),
};

export const obtenerExpediente: ValidationSchema = idParam;
export const transicion: ValidationSchema = idParam;

export const cerrarExpediente: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({ motivo: Joi.string().trim().min(5).max(MAX_TEXTO_CORTO).required() }),
};

export const anexoInfo: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({
    salud: Joi.object({
      afiliado_sistema_salud: siNo,
      lugar_atencion_emergencia: corto,
      atendido_sector_salud: siNo,
      frecuencia_atencion: corto,
      diagnostico_medico: largo,
      terapias: Joi.array().items(Joi.object({ nombre: corto.required(), frecuencia: corto })).max(10),
      tratamiento_medico: largo,
      medicamentos: Joi.array().items(Joi.object({ nombre: corto.required(), frecuencia_horario: corto, en_horario_escolar: Joi.boolean() })).max(10),
      productos_apoyo: Joi.array().items(corto).max(15),
    }),
    hogar: Joi.object({
      madre: Joi.object({ nombre: corto, ocupacion: corto, nivel_educativo: nivel }),
      padre: Joi.object({ nombre: corto, ocupacion: corto, nivel_educativo: nivel }),
      cuidador: Joi.object({ nombre: corto, parentesco: corto, nivel_educativo: nivel, telefono: corto, correo: corto }),
      numero_hermanos: Joi.number().integer().min(0).max(30).allow(null),
      lugar_que_ocupa: Joi.number().integer().min(1).max(30).allow(null),
      vive_con: corto,
      quienes_apoyan_crianza: corto,
      bajo_proteccion: siNo,
      subsidios: corto,
    }),
    educativo: Joi.object({
      vinculado_otra_institucion: siNo,
      instituciones_previas: corto,
      motivo_cambio: corto,
      ultimo_grado_cursado: corto,
      aprobo_ultimo_grado: siNo,
      informe_pedagogico_previo: siNo,
      procedencia_informe: corto,
      programas_complementarios: corto,
      medio_transporte: corto,
      tiempo_desplazamiento: corto,
    }),
  }),
};

export const caracteristicas: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({
    descripcion_general: largo,
    gustos_intereses: largo,
    aspectos_que_le_desagradan: largo,
    expectativas_estudiante: largo,
    expectativas_familia: largo,
    lo_que_hace_puede_requiere_apoyo: largo,
    habilidades_competencias: largo,
    valoracion_pedagogica: largo,
    barreras_generales: largo,
    recomendaciones_aula: largo,
    pautas_evaluacion: largo,
    alerta_seguridad_aula: corto,
    recursos_necesarios: largo,
    proyectos_especificos: largo,
    otra_informacion: largo,
    actividades_en_casa_receso: largo,
  }),
};

export const categoria: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({ categoria_discapacidad: Joi.string().valid(...CODIGOS_CATEGORIA_DISCAPACIDAD).required() }),
};

export const transversales: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({
    items: Joi.array()
      .items(Joi.object({ dimension: Joi.string().valid(...DIMENSIONES_TRANSVERSALES).required(), objetivo: largo, barrera: largo, ajuste: largo, evaluacion: largo }))
      .max(DIMENSIONES_TRANSVERSALES.length)
      .unique('dimension')
      .required(),
  }),
};

export const pmi: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({
    items: Joi.array()
      .items(Joi.object({ actor: Joi.string().valid(...ACTORES_PMI).required(), accion: largo, estrategia: largo }))
      .max(25)
      .required(),
  }),
};

export const compromisosFamilia: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({
    items: Joi.array()
      .items(Joi.object({ actividad: corto.required().min(2), descripcion: largo, frecuencia: Joi.string().valid(...FRECUENCIAS_COMPROMISO).required() }))
      .max(15)
      .required(),
  }),
};

export const compromisosAula: ValidationSchema = { params: idParam.params, body: Joi.object({ texto: largo.required() }) };

export const planApoyo: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({
    tipo_necesidad: Joi.string().valid(...TIPOS_NECESIDAD_PLAN_APOYO).allow(null),
    observacion_inicial: largo,
    compromisos_casa: largo,
    pautas_aula: Joi.array().items(corto.min(2)).max(20),
    pautas_evaluacion: largo,
  }),
};

export const informeAnual: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({ logros: largo, dificultades_persistentes: largo, eficacia_de_ajustes: largo, recomendaciones_grado_siguiente: largo, ajustes_a_mantener: largo }),
};

export const consentimiento: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({ otorgado_por_nombre: Joi.string().trim().min(3).max(120).required(), parentesco: Joi.string().trim().min(2).max(60).required() }),
};

export const revocarConsentimiento: ValidationSchema = cerrarExpediente;

export const cargarSoporte: ValidationSchema = { params: idParam.params, body: Joi.object({ descripcion: corto }) };

export const archivoDeSoporte: ValidationSchema = {
  params: Joi.object({ id: objectId.required(), soporteId: objectId.required() }),
};

// --- Ajustes ---

const paramsAjuste = { params: Joi.object({ id: objectId.required(), subjectId: objectId.required() }) };

export const listarAjustes: ValidationSchema = idParam;

export const guardarAjuste: ValidationSchema = {
  ...paramsAjuste,
  body: Joi.object({
    dba_ids: Joi.array().items(objectId).max(15),
    objetivo_flexibilizado: largo,
    barrera_asignatura: largo,
    tipos_barrera: Joi.array().items(Joi.string().valid(...TIPOS_BARRERA)).max(TIPOS_BARRERA.length),
    ajuste_metodologico: largo,
    ajuste_evaluativo: largo,
    categorias_ajuste: Joi.array().items(Joi.string().valid(...CATEGORIAS_AJUSTE)).max(CATEGORIAS_AJUSTE.length),
    recursos: largo,
  }),
};

export const registrarSeguimiento: ValidationSchema = {
  ...paramsAjuste,
  body: Joi.object({
    periodo_numero: Joi.number().integer().min(1).max(4).required(),
    efectividad: Joi.string().valid(...EFECTIVIDAD_AJUSTE).required(),
    observacion: largo,
    nueva_accion: corto,
  }),
};

// --- Documentos ---

export const listarDocumentos: ValidationSchema = idParam;
export const emitirDocumento: ValidationSchema = { params: idParam.params, body: Joi.object({ clave: Joi.string().valid(...CLAVES_DOCUMENTO_PIAR).required() }) };
export const documento: ValidationSchema = idParam;

export const firmarDocumento: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({
    firmantes: Joi.array()
      .items(Joi.object({ nombre: Joi.string().trim().min(3).max(120).required(), rol: Joi.string().valid(...ROLES_FIRMANTE).required() }))
      .min(1)
      .max(8)
      .required(),
  }),
};

// --- Configuración, buscador e indicador ---

export const actualizarConfiguracion: ValidationSchema = {
  body: Joi.object({
    plazo_elaboracion_dias: Joi.number().integer().min(1).max(365),
    seguimientos_minimos_anio: Joi.number().integer().min(1).max(12),
    retencion_anios: Joi.number().integer().min(1).max(100).allow(null),
    declaracion_establecimiento: Joi.string().trim().min(10).max(1000),
    declaracion_familia: Joi.string().trim().min(10).max(1000),
    version_politica_datos: Joi.string().trim().min(1).max(30),
  }).min(1),
};

export const buscarEstudiantes: ValidationSchema = { query: Joi.object({ group_id: objectId, q: Joi.string().trim().max(60) }) };
export const indicadorDeGrupo: ValidationSchema = { params: Joi.object({ groupId: objectId.required() }) };
