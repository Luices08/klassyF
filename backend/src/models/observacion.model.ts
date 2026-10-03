import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  CLASES_REGISTRO,
  ClaseRegistro,
  CONTEXTOS_OBSERVACION,
  ContextoObservacion,
  ESTADOS_COMPROMISO,
  ESTADOS_OBSERVACION,
  EstadoCompromiso,
  EstadoObservacion,
  MAX_COMPROMISO,
  MAX_DESCRIPCION_OBSERVACION,
  TIPOS_SITUACION,
  TipoSituacion,
} from '../constants/convivencia';

export interface IEnmiendaObservacion {
  fecha: Date;
  por: Types.ObjectId;
  descripcion_anterior: string;
  compromiso_anterior: string;
  version_estudiante_anterior: string;
}

export interface ISeguimientoObservacion {
  fecha: Date;
  nota: string;
  por: Types.ObjectId;
}

/** La falta del manual elegida, copiada al guardar: editar o desactivar el catálogo no altera lo ya registrado. */
export interface IFaltaRegistrada {
  falta_id: Types.ObjectId;
  codigo: string;
  descripcion: string;
  gravedad: TipoSituacion;
}

/**
 * Registro primario del Observador (M14). Pertenece al estudiante (persona), no al grupo: el grupo, la sede y la matrícula
 * vigentes en la fecha del hecho quedan como contexto. Hay dos clases que comparten el Observador y el historial:
 *  - OBSERVACION: cotidiana, de un tipo que define el coordinador (tipo, descripción, compromiso, citación, confidencial).
 *  - FALTA: una falta del manual de convivencia (M15) con su gravedad; la Tipo I se queda aquí como antecedente
 *    pedagógico y la Tipo II/III (o la que el docente remite) genera una solicitud de caso.
 * Nunca se borra: se enmienda (versión anterior conservada) o se anula con motivo.
 */
export interface IObservacion {
  student_id: Types.ObjectId;
  enrollment_id: Types.ObjectId;
  group_id: Types.ObjectId;
  sede_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  periodo_numero: number | null;
  fecha_hecho: Date;
  clase: ClaseRegistro;
  /** Los hechos, en texto libre y de forma objetiva. */
  descripcion: string;
  /** Texto opcional: en una falta Tipo I es el acuerdo formativo. */
  compromiso: string;
  /** null mientras no haya compromiso; el seguimiento lo marca cumplido o incumplido. */
  compromiso_estado: EstadoCompromiso | null;
  // --- OBSERVACION ---
  tipo_id: Types.ObjectId | null;
  tipo_nombre: string;
  /** Se copia del tipo al guardar: cambiarlo después no revela ni oculta lo ya registrado. */
  visible_estudiante: boolean;
  /** Indicador de que la situación amerita citar a la familia; el seguimiento registra si se hizo. */
  requiere_citacion: boolean;
  citacion_realizada: { fecha: Date; resultado: string; por: Types.ObjectId } | null;
  /** Restringe la consulta a quien la escribió, orientación, coordinación de convivencia y el ADMIN. */
  confidencial: boolean;
  // --- FALTA ---
  falta: IFaltaRegistrada | null;
  /** Falta Tipo I: lo que el estudiante manifestó. En II/III los descargos son del comité. */
  version_estudiante: string;
  /** Solicitud de caso que esta falta generó (Tipo II/III, o Tipo I remitida). */
  solicitud_id: Types.ObjectId | null;
  /** Un mismo hecho con varios estudiantes crea un registro por estudiante con este id común. */
  evento_id: Types.ObjectId | null;
  registrado_por: Types.ObjectId;
  /** A quién se atribuye: el propio autor, o el docente en cuyo nombre registró coordinación. */
  autor_id: Types.ObjectId;
  contexto: ContextoObservacion;
  estado: EstadoObservacion;
  anulacion: { motivo: string; por: Types.ObjectId; fecha: Date } | null;
  enmiendas: Types.DocumentArray<IEnmiendaObservacion>;
  seguimientos: Types.DocumentArray<ISeguimientoObservacion>;
  createdAt: Date;
  updatedAt: Date;
}

export type ObservacionDocument = HydratedDocument<IObservacion>;
type ObservacionModel = Model<IObservacion>;

const enmiendaSchema = new Schema<IEnmiendaObservacion>({
  fecha: { type: Date, required: true },
  por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  descripcion_anterior: { type: String, default: '' },
  compromiso_anterior: { type: String, default: '' },
  version_estudiante_anterior: { type: String, default: '' },
});

const seguimientoSchema = new Schema<ISeguimientoObservacion>({
  fecha: { type: Date, required: true },
  nota: { type: String, required: true, trim: true, maxlength: 500 },
  por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

const faltaRegistradaSchema = new Schema<IFaltaRegistrada>(
  {
    falta_id: { type: Schema.Types.ObjectId, ref: 'FaltaConvivencia', required: true },
    codigo: { type: String, required: true },
    descripcion: { type: String, required: true },
    gravedad: { type: String, enum: TIPOS_SITUACION, required: true },
  },
  { _id: false }
);

const citacionRealizadaSchema = new Schema(
  {
    fecha: { type: Date, required: true },
    resultado: { type: String, default: '', maxlength: 500 },
    por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false }
);

const anulacionSchema = new Schema(
  {
    motivo: { type: String, required: true },
    por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fecha: { type: Date, required: true },
  },
  { _id: false }
);

const observacionSchema = new Schema<IObservacion, ObservacionModel>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    enrollment_id: { type: Schema.Types.ObjectId, ref: 'Enrollment', required: true },
    group_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    sede_id: { type: Schema.Types.ObjectId, ref: 'Campus', required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    periodo_numero: { type: Number, default: null },
    fecha_hecho: { type: Date, required: true },
    clase: { type: String, enum: CLASES_REGISTRO, required: true },
    descripcion: { type: String, required: true, trim: true, maxlength: MAX_DESCRIPCION_OBSERVACION },
    compromiso: { type: String, default: '', trim: true, maxlength: MAX_COMPROMISO },
    compromiso_estado: { type: String, enum: [...ESTADOS_COMPROMISO, null], default: null },
    tipo_id: { type: Schema.Types.ObjectId, ref: 'TipoObservacion', default: null },
    tipo_nombre: { type: String, default: '' },
    visible_estudiante: { type: Boolean, default: false },
    requiere_citacion: { type: Boolean, default: false },
    citacion_realizada: { type: citacionRealizadaSchema, default: null },
    confidencial: { type: Boolean, default: false },
    falta: { type: faltaRegistradaSchema, default: null },
    version_estudiante: { type: String, default: '', trim: true, maxlength: MAX_DESCRIPCION_OBSERVACION },
    solicitud_id: { type: Schema.Types.ObjectId, ref: 'SolicitudCaso', default: null },
    evento_id: { type: Schema.Types.ObjectId, default: null },
    registrado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    autor_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    contexto: { type: String, enum: CONTEXTOS_OBSERVACION, required: true },
    estado: { type: String, enum: ESTADOS_OBSERVACION, default: 'ACTIVA' },
    anulacion: { type: anulacionSchema, default: null },
    enmiendas: { type: [enmiendaSchema], default: [] },
    seguimientos: { type: [seguimientoSchema], default: [] },
  },
  { timestamps: true }
);

// Invariantes de cada clase: una observación tiene tipo y ninguna falta; una falta tiene falta y ningún tipo.
observacionSchema.pre('validate', function validarClase(this: IObservacion, next) {
  if (this.clase === 'OBSERVACION' && (!this.tipo_id || this.falta)) {
    return next(new Error('Una observación debe tener tipo de observación y no puede traer una falta.'));
  }
  if (this.clase === 'FALTA' && (!this.falta || this.tipo_id || this.confidencial || this.requiere_citacion)) {
    return next(new Error('Una falta debe traer la falta del manual y no usa tipo, confidencialidad ni citación.'));
  }
  next();
});

observacionSchema.index({ student_id: 1, academic_year_id: 1, fecha_hecho: -1 });
observacionSchema.index({ group_id: 1, periodo_numero: 1 });
observacionSchema.index({ autor_id: 1, fecha_hecho: -1 });
observacionSchema.index({ registrado_por: 1, fecha_hecho: -1 });
observacionSchema.index({ evento_id: 1 }, { sparse: true });
observacionSchema.index({ solicitud_id: 1 }, { sparse: true });

export const Observacion = model<IObservacion, ObservacionModel>('Observacion', observacionSchema);
export default Observacion;
