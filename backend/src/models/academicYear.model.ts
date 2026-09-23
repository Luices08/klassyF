import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  CALENDARIOS,
  Calendario,
  ESTADOS_ANIO_LECTIVO,
  ESTADOS_PERIODO,
  EstadoAnioLectivo,
  EstadoPeriodo,
} from '../constants/enums';

export interface IPeriodo {
  numero: number;
  nombre: string;
  porcentaje: number;
  fecha_inicio: Date;
  fecha_fin: Date;
  estado: EstadoPeriodo;
}

export interface IAcademicYear {
  institucion_id: Types.ObjectId;
  year: number;
  calendario: Calendario;
  estado: EstadoAnioLectivo;
  periodos: Types.DocumentArray<IPeriodo>;
  createdAt: Date;
  updatedAt: Date;
}

export type AcademicYearDocument = HydratedDocument<IAcademicYear>;
type AcademicYearModel = Model<IAcademicYear>;

const periodoSchema = new Schema<IPeriodo>(
  {
    numero: { type: Number, required: true, min: 1, max: 4 },
    nombre: { type: String, required: true, trim: true },
    porcentaje: { type: Number, required: true, min: 0, max: 100 },
    fecha_inicio: { type: Date, required: true },
    fecha_fin: { type: Date, required: true },
    estado: { type: String, enum: ESTADOS_PERIODO, default: 'CERRADO' },
  },
  { _id: true }
);

periodoSchema.pre('validate', function validateFechas(this: IPeriodo, next) {
  if (this.fecha_inicio && this.fecha_fin && this.fecha_fin < this.fecha_inicio) {
    return next(new Error(`El periodo "${this.nombre}" tiene fecha_fin anterior a fecha_inicio.`));
  }
  next();
});

const academicYearSchema = new Schema<IAcademicYear, AcademicYearModel>(
  {
    institucion_id: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
    year: { type: Number, required: true, min: 2000, max: 2100 },
    calendario: { type: String, enum: CALENDARIOS, required: true },
    estado: { type: String, enum: ESTADOS_ANIO_LECTIVO, default: 'PLANIFICACION' },
    periodos: {
      type: [periodoSchema],
      validate: {
        validator: (periodos: Types.DocumentArray<IPeriodo>) => Array.isArray(periodos) && periodos.length > 0,
        message: 'El año lectivo debe tener al menos un periodo.',
      },
    },
  },
  { timestamps: true }
);

// Un año lectivo es unico por institucion.
academicYearSchema.index({ institucion_id: 1, year: 1 }, { unique: true });

// Restriccion de negocio explicita: la suma de porcentajes de los periodos debe ser exactamente 100.
academicYearSchema.pre('validate', function validatePorcentajes(this: IAcademicYear, next) {
  if (!this.periodos || this.periodos.length === 0) return next();

  const total = this.periodos.reduce((sum, p) => sum + (p.porcentaje || 0), 0);
  // Redondeo a 2 decimales para evitar falsos negativos por precision de punto flotante.
  const totalRedondeado = Math.round(total * 100) / 100;

  if (totalRedondeado !== 100) {
    const err = new Error(
      `La suma de los porcentajes de los periodos debe ser exactamente 100. Suma actual: ${totalRedondeado}.`
    ) as Error & { statusCode?: number };
    err.statusCode = 400;
    return next(err);
  }
  next();
});

export const AcademicYear = model<IAcademicYear, AcademicYearModel>('AcademicYear', academicYearSchema);
export default AcademicYear;
