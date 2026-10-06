import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  ESTADOS_USUARIO,
  EstadoUsuario,
  GRUPOS_GRADOS_EBC,
  GrupoGradosEbc,
  TIPOS_REFERENTE,
  TipoReferente,
} from '../../../constants/enums';

/**
 * m07_referentes_curriculares: banco unico de referentes curriculares
 * oficiales del MEN (DBA, EBC, Lineamiento — Matriz ICFES queda reservada
 * hasta que se aporte esa fuente, ver enums.ts). Una sola coleccion con
 * discriminador por `tipo_referente`: Activity.dba_id (M12) y
 * CurricularDevelopment.dba_seleccionados (M07) ya apuntan por _id a esta
 * coleccion sin importar el tipo — un discriminador permite que cada tipo
 * tenga su propio contrato estricto (sin campos nulos "por si acaso" como en
 * el diseño anterior) sin fragmentar esa referencia en varias colecciones.
 */

export interface IReferenteCurricular {
  tipo_referente: TipoReferente;
  // Solo es null en un Lineamiento transversal (marco general, no propio de
  // un area) — DBA y EBC siempre lo exigen (lo valida el pre('validate') de
  // cada discriminador, ver abajo).
  area_id?: Types.ObjectId | null;
  etiquetas: string[];
  version: string;
  fuente: string;
  // activo = Vigente, inactivo = Historico (una version del MEN que ya no se ofrece para seleccion, se conserva por trazabilidad).
  estado: EstadoUsuario;
  createdAt: Date;
  updatedAt: Date;
}

export type ReferenteCurricularDocument = HydratedDocument<IReferenteCurricular>;
type ReferenteCurricularModel = Model<IReferenteCurricular>;

function errorDeValidacion(mensaje: string): Error & { statusCode: number } {
  const err = new Error(mensaje) as Error & { statusCode: number };
  err.statusCode = 400;
  return err;
}

const referenteCurricularSchema = new Schema<IReferenteCurricular, ReferenteCurricularModel>(
  {
    tipo_referente: { type: String, enum: TIPOS_REFERENTE, required: true },
    area_id: { type: Schema.Types.ObjectId, ref: 'Area', default: null },
    etiquetas: { type: [String], default: [] },
    version: { type: String, default: 'V1', trim: true },
    fuente: { type: String, default: 'MEN - Colombia Aprende', trim: true },
    estado: { type: String, enum: ESTADOS_USUARIO, default: 'activo' },
  },
  { discriminatorKey: 'tipo_referente', timestamps: true }
);

referenteCurricularSchema.index({ tipo_referente: 1, area_id: 1 });
referenteCurricularSchema.index({ etiquetas: 1 });

export const ReferenteCurricular = model<IReferenteCurricular, ReferenteCurricularModel>(
  'ReferenteCurricular',
  referenteCurricularSchema
);

// --- DBA (Derechos Basicos de Aprendizaje): el corazon del banco --------

export interface IDba extends IReferenteCurricular {
  area_id: Types.ObjectId;
  grade_id: Types.ObjectId;
  numero_dba: number;
  // Pensamiento (Matematicas) / Factor (Lenguaje) / Entorno (C. Naturales) / Eje (C. Sociales).
  organizador: string;
  enunciado: string;
  evidencias_aprendizaje: string[];
  ejemplo?: string;
}

const dbaSchema = new Schema<IDba>({
  grade_id: { type: Schema.Types.ObjectId, ref: 'Grade', required: true },
  numero_dba: { type: Number, required: true, min: 1 },
  organizador: { type: String, required: true, trim: true },
  enunciado: { type: String, required: true, trim: true },
  evidencias_aprendizaje: { type: [String], default: [] },
  ejemplo: { type: String, trim: true, default: '' },
});

dbaSchema.pre('validate', function requiereArea(this: IDba, next) {
  if (!this.area_id) return next(errorDeValidacion('Un DBA debe pertenecer a un area.'));
  next();
});

// Un solo DBA con ese numero por area y grado (misma restriccion del diseño anterior).
dbaSchema.index(
  { area_id: 1, grade_id: 1, numero_dba: 1 },
  { unique: true, partialFilterExpression: { tipo_referente: 'DBA' } }
);
dbaSchema.index({ area_id: 1, grade_id: 1, organizador: 1 });

export const Dba = ReferenteCurricular.discriminator<IDba>('DBA', dbaSchema);

// --- EBC (Estandares Basicos de Competencias) ---------------------------

export interface IEbc extends IReferenteCurricular {
  area_id: Types.ObjectId;
  grupo_grados: GrupoGradosEbc;
  organizador: string;
  competencia: string;
  enunciado: string;
  evidencias_aprendizaje: string[];
  // DBA de esa misma area cuyo grado cae dentro de este grupo de grados. No es
  // un cruce oficial del MEN (no publicaron una tabla DBA<->EBC): se calcula
  // al sembrar por area + organizador + grado-en-rango (ver seed).
  dba_relacionados: Types.ObjectId[];
}

const ebcSchema = new Schema<IEbc>({
  grupo_grados: { type: String, enum: GRUPOS_GRADOS_EBC, required: true },
  organizador: { type: String, required: true, trim: true },
  competencia: { type: String, required: true, trim: true },
  enunciado: { type: String, required: true, trim: true },
  evidencias_aprendizaje: { type: [String], default: [] },
  dba_relacionados: { type: [Schema.Types.ObjectId], ref: 'ReferenteCurricular', default: [] },
});

ebcSchema.pre('validate', function requiereArea(this: IEbc, next) {
  if (!this.area_id) return next(errorDeValidacion('Un EBC debe pertenecer a un area.'));
  next();
});

ebcSchema.index({ area_id: 1, grupo_grados: 1, organizador: 1 });

export const Ebc = ReferenteCurricular.discriminator<IEbc>('EBC', ebcSchema);

// --- Lineamiento Curricular: ficha de consulta, no se selecciona ---------

export interface ILineamiento extends IReferenteCurricular {
  titulo: string;
  contenido: string;
  // Orden de lectura sugerido dentro del area (o del marco general si area_id es null).
  orden: number;
}

const lineamientoSchema = new Schema<ILineamiento>({
  titulo: { type: String, required: true, trim: true },
  contenido: { type: String, required: true, trim: true },
  orden: { type: Number, default: 1, min: 1 },
});

lineamientoSchema.index({ area_id: 1, orden: 1 });

export const Lineamiento = ReferenteCurricular.discriminator<ILineamiento>('LINEAMIENTO', lineamientoSchema);

export default ReferenteCurricular;
