import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  ACCIONES_PAZ_Y_SALVO_SALIDA,
  AccionPazYSalvoSalida,
  ESTADOS_PAZ_Y_SALVO_SALIDA,
  EstadoPazYSalvoSalida,
  MAX_LONGITUD_MOTIVO_SALIDA,
} from '../constants/salidas';

/** Cada cambio de una dependencia: quién, cuándo, qué y por qué. El historial solo crece. */
export interface ICambioDependenciaSalida {
  accion: AccionPazYSalvoSalida;
  estado_resultante: EstadoPazYSalvoSalida;
  por: Types.ObjectId | null;
  fecha: Date;
  motivo: string;
}

export interface IDependenciaSalida {
  /** Clave de la dependencia en `ConfiguracionCertificados.paz_y_salvo` (M26): se copia el nombre para que el histórico no cambie si el colegio la renombra. */
  clave: string;
  nombre: string;
  estado: EstadoPazYSalvoSalida;
  /** Qué debe: la deuda o el material pendiente, mientras está BLOQUEADO. */
  detalle: string;
  /** Aprobada pese a una deuda, con autorización de Rectoría o Secretaría. */
  excepcion: { autorizada_por: Types.ObjectId; fecha: Date; motivo: string } | null;
  revisado_por: Types.ObjectId | null;
  fecha_revision: Date | null;
  historial: ICambioDependenciaSalida[];
}

/** El paz y salvo previo a los documentos de salida de un estudiante retirado o trasladado (uno por matrícula). */
export interface IPazYSalvoSalida {
  enrollment_id: Types.ObjectId;
  student_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  dependencias: IDependenciaSalida[];
  createdAt: Date;
  updatedAt: Date;
}

export type PazYSalvoSalidaDocument = HydratedDocument<IPazYSalvoSalida>;
type PazYSalvoSalidaModel = Model<IPazYSalvoSalida>;

const cambioSchema = new Schema<ICambioDependenciaSalida>(
  {
    accion: { type: String, enum: ACCIONES_PAZ_Y_SALVO_SALIDA, required: true },
    estado_resultante: { type: String, enum: ESTADOS_PAZ_Y_SALVO_SALIDA, required: true },
    por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    fecha: { type: Date, required: true },
    motivo: { type: String, default: '', trim: true, maxlength: MAX_LONGITUD_MOTIVO_SALIDA },
  },
  { _id: false }
);

const dependenciaSchema = new Schema<IDependenciaSalida>(
  {
    clave: { type: String, required: true },
    nombre: { type: String, required: true },
    estado: { type: String, enum: ESTADOS_PAZ_Y_SALVO_SALIDA, default: 'PENDIENTE' },
    detalle: { type: String, default: '', trim: true, maxlength: MAX_LONGITUD_MOTIVO_SALIDA },
    excepcion: {
      type: new Schema(
        {
          autorizada_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          fecha: { type: Date, required: true },
          motivo: { type: String, required: true, trim: true, maxlength: MAX_LONGITUD_MOTIVO_SALIDA },
        },
        { _id: false }
      ),
      default: null,
    },
    revisado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    fecha_revision: { type: Date, default: null },
    historial: { type: [cambioSchema], default: [] },
  },
  { _id: false }
);

const pazYSalvoSalidaSchema = new Schema<IPazYSalvoSalida, PazYSalvoSalidaModel>(
  {
    enrollment_id: { type: Schema.Types.ObjectId, ref: 'Enrollment', required: true, unique: true },
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    dependencias: { type: [dependenciaSchema], default: [] },
  },
  { timestamps: true }
);

pazYSalvoSalidaSchema.index({ academic_year_id: 1 });

export const PazYSalvoSalida = model<IPazYSalvoSalida, PazYSalvoSalidaModel>('PazYSalvoSalida', pazYSalvoSalidaSchema);
export default PazYSalvoSalida;
