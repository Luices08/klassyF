import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_NOTA, EstadoNota } from '../constants/notas';

/** Una nota digitada directo (componentes que no salen de actividades, como la autoevaluación), con su historia. */
export interface INotaDirecta {
  componente_clave: string;
  valor: number;
  registrado_por: Types.ObjectId;
  fecha: Date;
  historial: Types.DocumentArray<{ valor_anterior: number | null; valor_nuevo: number; por: Types.ObjectId; fecha: Date }>;
}

/** Lo que se congela al cerrar: es lo único que lee el boletín (M17), así una edición posterior no lo altera sin pasar por reabrir. */
export interface IResultadoCerrado {
  componentes: Array<{ clave: string; nombre: string; porcentaje: number; nota: number }>;
  nota_asignatura: number;
}

export interface IReapertura {
  por: Types.ObjectId;
  fecha: Date;
  motivo: string;
  desde: EstadoNota;
}

/**
 * La nota de UNA asignatura de UN estudiante en UN periodo (M12). Las notas de actividades viven en `ActivitySubmission`
 * (M11); aquí está lo que es propio de la asignatura: sus notas directas, el estado del flujo y el resultado congelado.
 * `group_id` y `subject_id` se copian de la asignación (no cambian) para consultar por grupo o asignatura sin cruzarla (M17/M30).
 */
export interface ICalificacionAsignatura {
  academic_year_id: Types.ObjectId;
  teacher_assignment_id: Types.ObjectId;
  group_id: Types.ObjectId;
  subject_id: Types.ObjectId;
  periodo_numero: number;
  student_id: Types.ObjectId;
  estado: EstadoNota;
  notas_directas: Types.DocumentArray<INotaDirecta>;
  resultado: IResultadoCerrado | null;
  cerrado_por: Types.ObjectId | null;
  cerrado_at: Date | null;
  definitivo_por: Types.ObjectId | null;
  definitivo_at: Date | null;
  reaperturas: Types.DocumentArray<IReapertura>;
  createdAt: Date;
  updatedAt: Date;
}

export type CalificacionAsignaturaDocument = HydratedDocument<ICalificacionAsignatura>;
type CalificacionAsignaturaModel = Model<ICalificacionAsignatura>;

const notaDirectaSchema = new Schema<INotaDirecta>(
  {
    componente_clave: { type: String, required: true },
    valor: { type: Number, required: true, min: 0 },
    registrado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fecha: { type: Date, required: true },
    historial: {
      type: [
        new Schema(
          {
            valor_anterior: { type: Number, default: null },
            valor_nuevo: { type: Number, required: true },
            por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            fecha: { type: Date, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { _id: false }
);

const resultadoSchema = new Schema<IResultadoCerrado>(
  {
    componentes: {
      type: [
        new Schema(
          {
            clave: { type: String, required: true },
            nombre: { type: String, required: true },
            porcentaje: { type: Number, required: true },
            nota: { type: Number, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    nota_asignatura: { type: Number, required: true },
  },
  { _id: false }
);

const calificacionAsignaturaSchema = new Schema<ICalificacionAsignatura, CalificacionAsignaturaModel>(
  {
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    teacher_assignment_id: { type: Schema.Types.ObjectId, ref: 'TeacherAssignment', required: true },
    group_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    subject_id: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    periodo_numero: { type: Number, required: true, min: 1, max: 4 },
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    estado: { type: String, enum: ESTADOS_NOTA, default: 'PENDIENTE' },
    notas_directas: { type: [notaDirectaSchema], default: [] },
    resultado: { type: resultadoSchema, default: null },
    cerrado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    cerrado_at: { type: Date, default: null },
    definitivo_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    definitivo_at: { type: Date, default: null },
    reaperturas: {
      type: [
        new Schema(
          {
            por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            fecha: { type: Date, required: true },
            motivo: { type: String, required: true },
            desde: { type: String, enum: ESTADOS_NOTA, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

// Un solo registro por estudiante, asignación y periodo.
calificacionAsignaturaSchema.index({ teacher_assignment_id: 1, periodo_numero: 1, student_id: 1 }, { unique: true });
// Boletín (M17) y reportes (M30): lo de un estudiante o de un grupo en un periodo.
calificacionAsignaturaSchema.index({ student_id: 1, academic_year_id: 1, periodo_numero: 1 });
calificacionAsignaturaSchema.index({ group_id: 1, academic_year_id: 1, periodo_numero: 1, estado: 1 });

// Un resultado congelado va siempre con un estado cerrado, y un estado abierto nunca lo conserva.
calificacionAsignaturaSchema.pre('validate', function coherenciaDelResultado(this: ICalificacionAsignatura, next) {
  const cerrado = this.estado === 'CERRADO' || this.estado === 'DEFINITIVO';
  if (cerrado && !this.resultado) return next(new Error('Una nota cerrada debe tener su resultado congelado.'));
  if (!cerrado && this.resultado) return next(new Error('Una nota abierta no conserva resultado congelado.'));
  next();
});

export const CalificacionAsignatura = model<ICalificacionAsignatura, CalificacionAsignaturaModel>(
  'CalificacionAsignatura',
  calificacionAsignaturaSchema
);
export default CalificacionAsignatura;
