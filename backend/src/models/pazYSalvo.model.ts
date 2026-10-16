import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { Rol, ROLES } from '../constants/enums';
import { ESTADOS_PAZ_Y_SALVO, EstadoPazYSalvo } from '../constants/pazYSalvo';

export interface IPazYSalvo {
  student_id: Types.ObjectId;
  /** El año que termina: el paz y salvo certifica que el estudiante no debe nada de ese año. */
  academic_year_id: Types.ObjectId;
  estado: EstadoPazYSalvo;
  /** Soporte opcional: confirmar sin archivo es válido (el «check» de quien lo revisa). */
  archivo_path: string | null;
  cargado_por: Types.ObjectId | null;
  cargado_por_rol: Rol | null;
  fecha_carga: Date | null;
  revisado_por: Types.ObjectId | null;
  revisado_por_rol: Rol | null;
  fecha_revision: Date | null;
  observacion: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PazYSalvoDocument = HydratedDocument<IPazYSalvo>;
type PazYSalvoModel = Model<IPazYSalvo>;

const pazYSalvoSchema = new Schema<IPazYSalvo, PazYSalvoModel>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    estado: { type: String, enum: ESTADOS_PAZ_Y_SALVO, default: 'CARGADO' },
    archivo_path: { type: String, default: null },
    cargado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    cargado_por_rol: { type: String, enum: ROLES, default: null },
    fecha_carga: { type: Date, default: null },
    revisado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revisado_por_rol: { type: String, enum: ROLES, default: null },
    fecha_revision: { type: Date, default: null },
    observacion: { type: String, default: null },
  },
  { timestamps: true }
);

// Uno por estudiante y año: volver a cargar o a revisar actualiza el mismo registro.
pazYSalvoSchema.index({ student_id: 1, academic_year_id: 1 }, { unique: true });

export const PazYSalvo = model<IPazYSalvo, PazYSalvoModel>('PazYSalvo', pazYSalvoSchema);
export default PazYSalvo;
