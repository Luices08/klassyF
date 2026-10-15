import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  EFECTOS_RECUPERACION,
  EfectoRecuperacion,
  ESTADOS_RECUPERACION,
  EstadoRecuperacion,
  MAX_CARACTERES_OBSERVACION_INTENTO,
  TIPOS_RECUPERACION,
  TipoRecuperacion,
} from '../constants/recuperaciones';
import { IntegracionPeriodo } from '../utils/integracionRecuperacion';
import { integracionSchema } from './configuracionRecuperaciones.model';

export interface IIntentoRecuperacion {
  nota: number;
  fecha: Date;
  registrado_por: Types.ObjectId;
  observacion: string;
}

/**
 * La recuperación de UNA asignatura de UN estudiante, de un periodo (`PERIODO`) o del año (`ANUAL`, `periodo_numero` = 0).
 * Se crea al registrar el primer intento: quién debe recuperar se calcula leyendo las notas cerradas (M12), no se guarda.
 * Guarda copiada la nota original y el efecto con que se calculó, así cambiar la política después no reescribe lo ya recuperado.
 * `group_id` y `subject_id` se copian de la asignación para consultar por grupo o asignatura sin cruzarla.
 */
export interface IRecuperacion {
  academic_year_id: Types.ObjectId;
  teacher_assignment_id: Types.ObjectId;
  group_id: Types.ObjectId;
  subject_id: Types.ObjectId;
  student_id: Types.ObjectId;
  tipo: TipoRecuperacion;
  periodo_numero: number;
  nota_original: number;
  efecto_aplicado: EfectoRecuperacion;
  /** La integración con que se calculó, copiada al primer intento: cambiar la política después no la altera. */
  integracion: IntegracionPeriodo;
  /** Cómo quedaron los bloques de la nota con la recuperación (vacío en el modo NOTA_FINAL); es lo que muestra el boletín. */
  componentes: Array<{ clave: string; nombre: string; porcentaje: number; nota: number }>;
  /** Qué hizo la integración con esta nota, en palabras. */
  detalle: string;
  intentos: Types.DocumentArray<IIntentoRecuperacion>;
  /** La nota con la que queda tras el mejor intento y el efecto; null mientras no hay intentos. */
  nota_resultante: number | null;
  estado: EstadoRecuperacion;
  createdAt: Date;
  updatedAt: Date;
}

export type RecuperacionDocument = HydratedDocument<IRecuperacion>;
type RecuperacionModel = Model<IRecuperacion>;

const intentoSchema = new Schema<IIntentoRecuperacion>(
  {
    nota: { type: Number, required: true, min: 0 },
    fecha: { type: Date, required: true },
    registrado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    observacion: { type: String, trim: true, maxlength: MAX_CARACTERES_OBSERVACION_INTENTO, default: '' },
  },
  { _id: true }
);

const recuperacionSchema = new Schema<IRecuperacion, RecuperacionModel>(
  {
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    teacher_assignment_id: { type: Schema.Types.ObjectId, ref: 'TeacherAssignment', required: true },
    group_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    subject_id: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tipo: { type: String, enum: TIPOS_RECUPERACION, required: true },
    periodo_numero: { type: Number, required: true, min: 0, max: 4 },
    nota_original: { type: Number, required: true, min: 0 },
    efecto_aplicado: { type: String, enum: EFECTOS_RECUPERACION, required: true },
    integracion: { type: integracionSchema, default: () => ({}) },
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
    detalle: { type: String, default: '' },
    intentos: { type: [intentoSchema], default: [] },
    nota_resultante: { type: Number, default: null },
    estado: { type: String, enum: ESTADOS_RECUPERACION, default: 'PENDIENTE' },
  },
  { timestamps: true }
);

// Una sola recuperación por estudiante, asignación, tipo y periodo (la anual usa periodo 0).
recuperacionSchema.index({ teacher_assignment_id: 1, student_id: 1, tipo: 1, periodo_numero: 1 }, { unique: true });
recuperacionSchema.index({ student_id: 1, academic_year_id: 1 });
recuperacionSchema.index({ group_id: 1, academic_year_id: 1, tipo: 1, periodo_numero: 1, estado: 1 });

recuperacionSchema.pre('validate', function coherenciaDelPeriodo(this: IRecuperacion, next) {
  if (this.tipo === 'ANUAL' && this.periodo_numero !== 0) return next(new Error('Una recuperación anual no pertenece a un periodo.'));
  if (this.tipo === 'PERIODO' && this.periodo_numero < 1) return next(new Error('Una recuperación de periodo exige el número del periodo.'));
  next();
});

export const Recuperacion = model<IRecuperacion, RecuperacionModel>('Recuperacion', recuperacionSchema);
export default Recuperacion;
