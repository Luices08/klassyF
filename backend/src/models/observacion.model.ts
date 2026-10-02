import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  CONTEXTOS_OBSERVACION,
  ContextoObservacion,
  ESTADOS_OBSERVACION,
  EstadoObservacion,
  FAMILIAS_OBSERVACION,
  FamiliaObservacion,
  MAX_COMENTARIO_OBSERVACION,
  ESTADOS_COMPROMISO,
  ESTADOS_SOLICITUD_CASO,
  EstadoCompromiso,
  EstadoSolicitudCaso,
  MEDIOS_CITACION,
  MedioCitacion,
  ORIGENES_SOLICITUD_CASO,
  OrigenSolicitudCaso,
  RESPONSABLES_COMPROMISO,
  ResponsableCompromiso,
  TIPOS_SITUACION,
  TipoSituacion,
} from '../constants/convivencia';

/** Frase elegida, copiada al guardar: cambiar o desactivar el catálogo no altera lo ya registrado. */
export interface IDescriptorRegistrado {
  descriptor_id: Types.ObjectId;
  codigo: string | null;
  texto: string;
  tipo_situacion: TipoSituacion | null;
}

export interface IEnmiendaObservacion {
  fecha: Date;
  por: Types.ObjectId;
  descriptores_anteriores: IDescriptorRegistrado[];
  comentario_anterior: string;
  texto_anterior: string;
}

export interface ICompromisoObservacion {
  descripcion: string;
  responsable: ResponsableCompromiso;
  fecha_limite: Date;
  estado: EstadoCompromiso;
  registrado_por: Types.ObjectId;
  fecha_cierre: Date | null;
  cerrado_por: Types.ObjectId | null;
  nota_cierre: string;
}

export interface ICitacionObservacion {
  fecha: Date;
  medio: MedioCitacion;
  /** A quién se dirigió (texto libre: el acudiente o responsable citado). */
  dirigida_a: string;
  resultado: string;
  registrado_por: Types.ObjectId;
}

export interface ISolicitudCaso {
  estado: EstadoSolicitudCaso;
  origen: OrigenSolicitudCaso;
  motivo: string;
  solicitada_por: Types.ObjectId;
  fecha: Date;
  resuelta_por: Types.ObjectId | null;
  fecha_resolucion: Date | null;
  motivo_resolucion: string;
  /** Caso de convivencia (M15) en que se convirtió la solicitud. */
  caso_id: Types.ObjectId | null;
}

/**
 * Registro primario del Observador (M14). Pertenece al estudiante (persona), no al grupo: el grupo, la sede y la
 * matrícula vigentes en la fecha del hecho quedan como contexto. Nunca se borra: se enmienda (versión anterior
 * conservada) o se anula con motivo.
 */
export interface IObservacion {
  student_id: Types.ObjectId;
  enrollment_id: Types.ObjectId;
  group_id: Types.ObjectId;
  sede_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  periodo_numero: number | null;
  fecha_hecho: Date;
  tipo_id: Types.ObjectId;
  tipo_nombre: string;
  familia: FamiliaObservacion;
  visible_estudiante: boolean;
  descriptores: IDescriptorRegistrado[];
  /** El mayor tipo de situación entre los descriptores elegidos; null si ninguno trae. Lo fija el catálogo, no el docente. */
  tipo_situacion_maxima: TipoSituacion | null;
  /** Texto libre; en una disciplinaria son los hechos. */
  comentario: string;
  texto_generado: string;
  /** Un mismo hecho con varios estudiantes crea un registro por estudiante con este id común. */
  evento_id: Types.ObjectId | null;
  registrado_por: Types.ObjectId;
  /** A quién se atribuye: el propio autor, o el docente en cuyo nombre registró coordinación. */
  autor_id: Types.ObjectId;
  contexto: ContextoObservacion;
  estado: EstadoObservacion;
  anulacion: { motivo: string; por: Types.ObjectId; fecha: Date } | null;
  enmiendas: Types.DocumentArray<IEnmiendaObservacion>;
  compromisos: Types.DocumentArray<ICompromisoObservacion>;
  citaciones: Types.DocumentArray<ICitacionObservacion>;
  solicitud_caso: ISolicitudCaso | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ObservacionDocument = HydratedDocument<IObservacion>;
type ObservacionModel = Model<IObservacion>;

const descriptorRegistradoSchema = new Schema<IDescriptorRegistrado>(
  {
    descriptor_id: { type: Schema.Types.ObjectId, ref: 'Descriptor', required: true },
    codigo: { type: String, default: null },
    texto: { type: String, required: true },
    tipo_situacion: { type: String, enum: [...TIPOS_SITUACION, null], default: null },
  },
  { _id: false }
);

const enmiendaSchema = new Schema<IEnmiendaObservacion>({
  fecha: { type: Date, required: true },
  por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  descriptores_anteriores: { type: [descriptorRegistradoSchema], default: [] },
  comentario_anterior: { type: String, default: '' },
  texto_anterior: { type: String, default: '' },
});

const compromisoSchema = new Schema<ICompromisoObservacion>({
  descripcion: { type: String, required: true, trim: true, maxlength: 500 },
  responsable: { type: String, enum: RESPONSABLES_COMPROMISO, required: true },
  fecha_limite: { type: Date, required: true },
  estado: { type: String, enum: ESTADOS_COMPROMISO, default: 'PENDIENTE' },
  registrado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  fecha_cierre: { type: Date, default: null },
  cerrado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  nota_cierre: { type: String, default: '', maxlength: 500 },
});

const citacionSchema = new Schema<ICitacionObservacion>({
  fecha: { type: Date, required: true },
  medio: { type: String, enum: MEDIOS_CITACION, required: true },
  dirigida_a: { type: String, default: '', trim: true, maxlength: 120 },
  resultado: { type: String, default: '', trim: true, maxlength: 500 },
  registrado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

const solicitudCasoSchema = new Schema<ISolicitudCaso>(
  {
    estado: { type: String, enum: ESTADOS_SOLICITUD_CASO, default: 'PENDIENTE' },
    origen: { type: String, enum: ORIGENES_SOLICITUD_CASO, required: true },
    motivo: { type: String, required: true, maxlength: 500 },
    solicitada_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fecha: { type: Date, required: true },
    resuelta_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    fecha_resolucion: { type: Date, default: null },
    motivo_resolucion: { type: String, default: '', maxlength: 500 },
    caso_id: { type: Schema.Types.ObjectId, ref: 'CasoConvivencia', default: null },
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
    tipo_id: { type: Schema.Types.ObjectId, ref: 'TipoObservacion', required: true },
    tipo_nombre: { type: String, required: true },
    familia: { type: String, enum: FAMILIAS_OBSERVACION, required: true },
    visible_estudiante: { type: Boolean, default: false },
    descriptores: { type: [descriptorRegistradoSchema], default: [] },
    tipo_situacion_maxima: { type: String, enum: [...TIPOS_SITUACION, null], default: null },
    comentario: { type: String, default: '', maxlength: MAX_COMENTARIO_OBSERVACION },
    texto_generado: { type: String, required: true },
    evento_id: { type: Schema.Types.ObjectId, default: null },
    registrado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    autor_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    contexto: { type: String, enum: CONTEXTOS_OBSERVACION, required: true },
    estado: { type: String, enum: ESTADOS_OBSERVACION, default: 'ACTIVA' },
    anulacion: { type: anulacionSchema, default: null },
    enmiendas: { type: [enmiendaSchema], default: [] },
    compromisos: { type: [compromisoSchema], default: [] },
    citaciones: { type: [citacionSchema], default: [] },
    solicitud_caso: { type: solicitudCasoSchema, default: null },
  },
  { timestamps: true }
);

observacionSchema.index({ student_id: 1, academic_year_id: 1, fecha_hecho: -1 });
observacionSchema.index({ group_id: 1, periodo_numero: 1 });
observacionSchema.index({ autor_id: 1, fecha_hecho: -1 });
observacionSchema.index({ registrado_por: 1, fecha_hecho: -1 });
observacionSchema.index({ evento_id: 1 }, { sparse: true });
// Bandeja de coordinación de convivencia.
observacionSchema.index({ 'solicitud_caso.estado': 1, sede_id: 1, fecha_hecho: -1 }, { sparse: true });

export const Observacion = model<IObservacion, ObservacionModel>('Observacion', observacionSchema);
export default Observacion;
