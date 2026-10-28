import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';

export const DECISIONES_CONTINUIDAD = ['CONTINUA', 'NO_CONTINUA'] as const;
export type DecisionContinuidad = (typeof DECISIONES_CONTINUIDAD)[number];
export const CANALES_CONTINUIDAD = ['SECRETARIA', 'PORTAL'] as const;
export type CanalContinuidad = (typeof CANALES_CONTINUIDAD)[number];

/**
 * La respuesta de la familia a «¿su hijo continúa el año siguiente?» (M04). Una por estudiante y año de destino. «Sin respuesta» no se guarda: se
 * deriva de que no exista el registro. La respuesta no crea matrícula ni reserva cupo. El grado, sede y jornada guardan el contexto al responder; el rollover de
 * M19 decide si se incluye al estudiante y en qué grupo. El grado es una proyección: el cierre de promoción decide al final si pasa o repite.
 */
export interface IConfirmacionContinuidad {
  student_id: Types.ObjectId;
  /** El año al que se renueva (el siguiente). */
  academic_year_id: Types.ObjectId;
  /** La matrícula del año que termina, de donde sale la sede y la jornada. */
  enrollment_id: Types.ObjectId;
  decision: DecisionContinuidad;
  /** Grado, sede y jornada proyectados desde la matrícula vigente al responder. */
  grade_id: Types.ObjectId | null;
  sede_id: Types.ObjectId;
  jornada_id: Types.ObjectId | null;
  motivo: string;
  canal: CanalContinuidad;
  registrada_por: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type ConfirmacionContinuidadDocument = HydratedDocument<IConfirmacionContinuidad>;
type ConfirmacionContinuidadModel = Model<IConfirmacionContinuidad>;

const confirmacionSchema = new Schema<IConfirmacionContinuidad, ConfirmacionContinuidadModel>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    enrollment_id: { type: Schema.Types.ObjectId, ref: 'Enrollment', required: true },
    decision: { type: String, enum: DECISIONES_CONTINUIDAD, required: true },
    grade_id: { type: Schema.Types.ObjectId, ref: 'Grade', default: null },
    sede_id: { type: Schema.Types.ObjectId, ref: 'Campus', required: true },
    jornada_id: { type: Schema.Types.ObjectId, ref: 'JornadaOperativa', default: null },
    motivo: { type: String, trim: true, maxlength: 300, default: '' },
    canal: { type: String, enum: CANALES_CONTINUIDAD, required: true },
    registrada_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

confirmacionSchema.index({ student_id: 1, academic_year_id: 1 }, { unique: true });
confirmacionSchema.index({ academic_year_id: 1, decision: 1 });

export const ConfirmacionContinuidad = model<IConfirmacionContinuidad, ConfirmacionContinuidadModel>('ConfirmacionContinuidad', confirmacionSchema);
export default ConfirmacionContinuidad;
