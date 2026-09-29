import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  CALENDARIOS,
  Calendario,
  ESTADOS_ANIO_LECTIVO,
  ESTADOS_PERIODO_ACADEMICO,
  EstadoAnioLectivo,
  EstadoPeriodoAcademico,
  TIPOS_EVENTO_CALENDARIO,
  TipoEventoCalendario,
} from '../constants/enums';
import { validarCalendario } from '../utils/calendarioAcademico';

export interface IPeriodo {
  numero: number;
  nombre: string;
  porcentaje: number;
  fecha_inicio: Date;
  fecha_fin: Date;
  // Ventana en la que los docentes digitan notas; null = sin limite de fechas.
  fecha_apertura_notas: Date | null;
  fecha_cierre_notas: Date | null;
  estado: EstadoPeriodoAcademico;
}

export interface IEventoCalendario {
  tipo: TipoEventoCalendario;
  nombre: string;
  fecha_inicio: Date;
  fecha_fin: Date;
  // Solo para RECUPERACION_PERIODO: el periodo que se recupera.
  periodo_numero: number | null;
  // Solo para recuperaciones: plazo para que los docentes registren resultados (M18).
  fecha_limite_resultados: Date | null;
}

// Fechas propias de una sede para un periodo (sede rural, calendario especial).
// Los porcentajes y el estado del periodo siguen siendo los institucionales.
export interface IPeriodoSede {
  numero: number;
  fecha_inicio: Date;
  fecha_fin: Date;
  fecha_apertura_notas: Date | null;
  fecha_cierre_notas: Date | null;
}

export interface ICalendarioSede {
  sede_id: Types.ObjectId;
  periodos: IPeriodoSede[];
}

export interface IAcademicYear {
  institucion_id: Types.ObjectId;
  year: number;
  nombre: string;
  calendario: Calendario;
  fecha_inicio: Date;
  fecha_fin: Date;
  estado: EstadoAnioLectivo;
  periodos: Types.DocumentArray<IPeriodo>;
  eventos: Types.DocumentArray<IEventoCalendario>;
  calendarios_sede: Types.DocumentArray<ICalendarioSede>;
  cerrado_at: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AcademicYearDocument = HydratedDocument<IAcademicYear>;
type AcademicYearModel = Model<IAcademicYear>;

type ErrorDeNegocio = Error & { statusCode?: number };

function errorDeNegocio(message: string): ErrorDeNegocio {
  const err: ErrorDeNegocio = new Error(message);
  err.statusCode = 400;
  return err;
}

const periodoSchema = new Schema<IPeriodo>(
  {
    numero: { type: Number, required: true, min: 1, max: 4 },
    nombre: { type: String, required: true, trim: true },
    porcentaje: { type: Number, required: true, min: 0, max: 100 },
    fecha_inicio: { type: Date, required: true },
    fecha_fin: { type: Date, required: true },
    fecha_apertura_notas: { type: Date, default: null },
    fecha_cierre_notas: { type: Date, default: null },
    estado: { type: String, enum: ESTADOS_PERIODO_ACADEMICO, default: 'PROGRAMADO' },
  },
  { _id: true }
);

periodoSchema.pre('validate', function validateFechas(this: IPeriodo, next) {
  if (this.fecha_inicio && this.fecha_fin && this.fecha_fin < this.fecha_inicio) {
    return next(new Error(`El periodo "${this.nombre}" tiene fecha_fin anterior a fecha_inicio.`));
  }
  next();
});

const eventoCalendarioSchema = new Schema<IEventoCalendario>(
  {
    tipo: { type: String, enum: TIPOS_EVENTO_CALENDARIO, required: true },
    nombre: { type: String, required: true, trim: true },
    fecha_inicio: { type: Date, required: true },
    fecha_fin: { type: Date, required: true },
    periodo_numero: { type: Number, min: 1, max: 4, default: null },
    fecha_limite_resultados: { type: Date, default: null },
  },
  { _id: true }
);

const periodoSedeSchema = new Schema<IPeriodoSede>(
  {
    numero: { type: Number, required: true, min: 1, max: 4 },
    fecha_inicio: { type: Date, required: true },
    fecha_fin: { type: Date, required: true },
    fecha_apertura_notas: { type: Date, default: null },
    fecha_cierre_notas: { type: Date, default: null },
  },
  { _id: false }
);

const calendarioSedeSchema = new Schema<ICalendarioSede>(
  {
    sede_id: { type: Schema.Types.ObjectId, ref: 'Campus', required: true },
    periodos: { type: [periodoSedeSchema], default: [] },
  },
  { _id: false }
);

const academicYearSchema = new Schema<IAcademicYear, AcademicYearModel>(
  {
    institucion_id: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
    year: { type: Number, required: true, min: 2000, max: 2100 },
    nombre: { type: String, required: true, trim: true },
    calendario: { type: String, enum: CALENDARIOS, required: true },
    fecha_inicio: { type: Date, required: true },
    fecha_fin: { type: Date, required: true },
    estado: { type: String, enum: ESTADOS_ANIO_LECTIVO, default: 'PLANIFICACION' },
    periodos: {
      type: [periodoSchema],
      validate: {
        // Colombia no exige exactamente 4 periodos por año lectivo; se permite entre 2 y 4.
        validator: (periodos: Types.DocumentArray<IPeriodo>) =>
          Array.isArray(periodos) && periodos.length >= 2 && periodos.length <= 4,
        message: 'El año lectivo debe tener entre 2 y 4 periodos.',
      },
    },
    eventos: { type: [eventoCalendarioSchema], default: [] },
    calendarios_sede: { type: [calendarioSedeSchema], default: [] },
    cerrado_at: { type: Date, default: null },
  },
  { timestamps: true }
);

// Un año lectivo es unico por institucion.
academicYearSchema.index({ institucion_id: 1, year: 1 }, { unique: true });

// Vigencia activa unica: la base de datos misma impide dos años EN_CURSO en la
// institucion, aunque dos activaciones lleguen a la vez.
academicYearSchema.index(
  { institucion_id: 1 },
  { unique: true, partialFilterExpression: { estado: 'EN_CURSO' } }
);

// Los años creados antes de M05 no tienen nombre ni fechas propias: se derivan
// de los periodos para que sigan siendo validos al guardarse.
academicYearSchema.pre('validate', function completarDatosDerivados(this: IAcademicYear, next) {
  if (!this.nombre && this.year) this.nombre = `Año lectivo ${this.year}`;

  if (this.periodos && this.periodos.length > 0) {
    if (!this.fecha_inicio) {
      this.fecha_inicio = new Date(Math.min(...this.periodos.map((p) => p.fecha_inicio.getTime())));
    }
    if (!this.fecha_fin) {
      this.fecha_fin = new Date(Math.max(...this.periodos.map((p) => p.fecha_fin.getTime())));
    }
  }
  next();
});

// Restriccion de negocio explicita: la suma de porcentajes de los periodos debe ser exactamente 100.
academicYearSchema.pre('validate', function validatePorcentajes(this: IAcademicYear, next) {
  if (!this.periodos || this.periodos.length === 0) return next();

  const total = this.periodos.reduce((sum, p) => sum + (p.porcentaje || 0), 0);
  // Redondeo a 2 decimales para evitar falsos negativos por precision de punto flotante.
  const totalRedondeado = Math.round(total * 100) / 100;

  if (totalRedondeado !== 100) {
    return next(
      errorDeNegocio(`La suma de los porcentajes de los periodos debe ser exactamente 100. Suma actual: ${totalRedondeado}.`)
    );
  }
  next();
});

// Periodos ordenados, dentro del año y sin traslapes; recesos y calendarios de
// sede dentro del año (ver validarCalendario).
academicYearSchema.pre('validate', function validarCronologia(this: IAcademicYear, next) {
  if (!this.periodos || this.periodos.length === 0 || !this.fecha_inicio || !this.fecha_fin) return next();

  const problema = validarCalendario(this);
  if (problema) return next(errorDeNegocio(problema));
  next();
});

export const AcademicYear = model<IAcademicYear, AcademicYearModel>('AcademicYear', academicYearSchema);
export default AcademicYear;
