import { Schema, Types } from 'mongoose';
import {
  ACCIONES_REVISION,
  AccionRevision,
  MAX_COMENTARIO_REVISION,
  MAX_DESCRIPCION_PLAN,
  MAX_NOMBRE_ARCHIVO,
  MAX_TITULO_PLAN,
  ORIGENES_VERSION,
  OrigenVersion,
} from '../constants/planeacion';
import type { ArchivoPlaneacion } from '../utils/almacenPlaneacion';

/**
 * Lo que el plan de área y el plan de aula (M07) comparten: un documento tiene versiones (cada una conserva su PDF) y un
 * historial de revisión. Se guardan embebidos porque siempre se leen junto al plan y son pocos.
 */

export const archivoPlaneacionSchema = new Schema<ArchivoPlaneacion>(
  {
    nombre: { type: String, required: true, trim: true, maxlength: MAX_NOMBRE_ARCHIVO },
    ruta: { type: String, required: true },
    bytes: { type: Number, required: true, min: 1 },
    sha256: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
  },
  { _id: false }
);

export interface IAdopcion {
  plan_aula_id: Types.ObjectId;
  docente_id: Types.ObjectId;
  version: number;
}

export interface IVersionPlan {
  numero: number;
  titulo: string;
  descripcion: string;
  archivo: ArchivoPlaneacion;
  origen: OrigenVersion;
  /** Solo en una adopción: de qué plan (y versión) se tomó el documento. */
  adoptado_de: IAdopcion | null;
  subido_por: Types.ObjectId;
  /** Instante de la radicación: de ahí salen la fecha y la hora que se muestran. */
  fecha: Date;
}

export const versionPlanSchema = new Schema<IVersionPlan>({
  numero: { type: Number, required: true, min: 1 },
  titulo: { type: String, required: true, trim: true, maxlength: MAX_TITULO_PLAN },
  descripcion: { type: String, required: true, trim: true, maxlength: MAX_DESCRIPCION_PLAN },
  archivo: { type: archivoPlaneacionSchema, required: true },
  origen: { type: String, enum: ORIGENES_VERSION, default: 'CARGADA' },
  adoptado_de: {
    type: new Schema<IAdopcion>(
      {
        plan_aula_id: { type: Schema.Types.ObjectId, ref: 'PlanAula', required: true },
        docente_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        version: { type: Number, required: true, min: 1 },
      },
      { _id: false }
    ),
    default: null,
  },
  subido_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  fecha: { type: Date, required: true },
});

export interface IRevisionPlan {
  accion: AccionRevision;
  /** Versión que se revisó. */
  version: number;
  comentario: string;
  /** null solo en la aprobación heredada de una adopción: no la dio una persona al revisar. */
  revisor_id: Types.ObjectId | null;
  fecha: Date;
  automatica: boolean;
}

export const revisionPlanSchema = new Schema<IRevisionPlan>({
  accion: { type: String, enum: ACCIONES_REVISION, required: true },
  version: { type: Number, required: true, min: 1 },
  comentario: { type: String, trim: true, maxlength: MAX_COMENTARIO_REVISION, default: '' },
  revisor_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  fecha: { type: Date, required: true },
  automatica: { type: Boolean, default: false },
});

// Devolver o reabrir sin decir por qué deja al docente sin saber qué corregir: el comentario es obligatorio en el modelo y no solo en la pantalla.
revisionPlanSchema.pre('validate', function exigirComentario(this: IRevisionPlan, next) {
  if ((this.accion === 'DEVUELTO' || this.accion === 'REABIERTO') && !this.comentario?.trim()) {
    return next(new Error('Devolver o reabrir un plan exige un comentario.'));
  }
  if (!this.automatica && !this.revisor_id) return next(new Error('Toda revisión que no es automática debe tener revisor.'));
  next();
});
