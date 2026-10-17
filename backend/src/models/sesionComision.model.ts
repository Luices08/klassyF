import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  TODAS_LAS_DECISIONES,
  DecisionDeCaso,
  ESTADOS_COMPROMISO,
  ESTADOS_SESION,
  EstadoCompromiso,
  EstadoSesion,
  INSTANCIAS_SESION,
  InstanciaSesion,
  REPRESENTACIONES,
  RESPONSABLES_COMPROMISO,
  Representacion,
  ResponsableCompromiso,
  TIPOS_CASO,
  TipoCaso,
  VOTOS,
  Voto,
} from '../constants/comision';

export interface IMiembroSesion {
  _id: Types.ObjectId;
  /** null = integrante externo sin usuario (personero, representante de padres): no firma con contraseña, firma en papel. */
  user_id: Types.ObjectId | null;
  nombre: string;
  cargo: string;
  representa: Representacion;
  es_presidente: boolean;
  asistio: boolean;
  firma: { fecha: Date } | null;
}

export interface ICasoSesion {
  _id: Types.ObjectId;
  student_id: Types.ObjectId;
  enrollment_id: Types.ObjectId;
  tipo: TipoCaso;
  /** El cierre de promoción vigente cuando se agregó el caso (M19); null en un caso de seguimiento. */
  evaluacion_id: Types.ObjectId | null;
  /** El trámite de promoción anticipada que se trata (M19, fase 6); null en los demás casos. */
  anticipada_id: Types.ObjectId | null;
  /** Miembros apartados de este caso (RN de conflicto de interés): no cuentan para el quórum del caso ni votan. */
  recusados_ids: Types.ObjectId[];
  deliberacion: string;
  votos: Array<{ miembro_id: Types.ObjectId; voto: Voto }>;
  decision: { tipo: DecisionDeCaso; fundamento: string } | null;
  /** Se calcula al realizar la sesión: la decisión solo pasa a M19 si fue aprobada por la mayoría y con quórum en el caso. */
  resultado_votacion: { a_favor: number; en_contra: number; abstenciones: number; habilitados: number; aprobada: boolean; quorum: boolean } | null;
}

export interface ICompromiso {
  _id: Types.ObjectId;
  caso_id: Types.ObjectId | null;
  student_id: Types.ObjectId;
  responsable_tipo: ResponsableCompromiso;
  responsable_user_id: Types.ObjectId | null;
  responsable_nombre: string;
  descripcion: string;
  fecha_limite: Date;
  estado: EstadoCompromiso;
  seguimientos: Array<{ fecha: Date; texto: string; por: Types.ObjectId }>;
}

/**
 * Una sesión de la Comisión de Evaluación y Promoción, del Consejo Académico o del Consejo Directivo (M20). Es el acta en construcción: lleva
 * el orden del día, los integrantes con su asistencia, los casos con su deliberación, votos y decisión, y los compromisos con fecha límite.
 * Al firmarse recibe el consecutivo y una huella SHA-256 y pasa a ser inmutable (salvo el seguimiento de los compromisos).
 */
export interface ISesionComision {
  instancia: InstanciaSesion;
  academic_year_id: Types.ObjectId;
  anio: number;
  /** Qué se evalúa: periodo concreto (alerta temprana) o null = cierre anual; grados vacíos = todos. */
  alcance: { periodo_numero: number | null; grados_ids: Types.ObjectId[] };
  estado: EstadoSesion;
  fecha: Date;
  hora: string;
  lugar: string;
  orden_del_dia: string;
  convocada_at: Date | null;
  miembros: Types.DocumentArray<IMiembroSesion>;
  casos: Types.DocumentArray<ICasoSesion>;
  compromisos: Types.DocumentArray<ICompromiso>;
  desarrollo: string;
  conclusiones: string;
  quorum: { total_miembros: number; presentes: number; porcentaje_requerido: number; alcanzado: boolean } | null;
  codigo: string | null;
  consecutivo: number | null;
  /** Huella del contenido firmable, calculada al quedar firmada. */
  hash: string | null;
  firmada_at: Date | null;
  anulacion: { motivo: string; por: Types.ObjectId; fecha: Date } | null;
  creado_por: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type SesionComisionDocument = HydratedDocument<ISesionComision>;
type SesionComisionModel = Model<ISesionComision>;

const miembroSchema = new Schema<IMiembroSesion>({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  nombre: { type: String, required: true, trim: true, maxlength: 120 },
  cargo: { type: String, required: true, trim: true, maxlength: 120 },
  representa: { type: String, enum: REPRESENTACIONES, default: 'OTRO' },
  es_presidente: { type: Boolean, default: false },
  asistio: { type: Boolean, default: false },
  firma: { type: new Schema({ fecha: { type: Date, required: true } }, { _id: false }), default: null },
});

const casoSchema = new Schema<ICasoSesion>({
  student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  enrollment_id: { type: Schema.Types.ObjectId, ref: 'Enrollment', required: true },
  tipo: { type: String, enum: TIPOS_CASO, required: true },
  evaluacion_id: { type: Schema.Types.ObjectId, ref: 'EvaluacionPromocionEstudiante', default: null },
  anticipada_id: { type: Schema.Types.ObjectId, ref: 'PromocionAnticipada', default: null },
  recusados_ids: { type: [Schema.Types.ObjectId], default: [] },
  deliberacion: { type: String, trim: true, maxlength: 3000, default: '' },
  votos: {
    type: [new Schema({ miembro_id: { type: Schema.Types.ObjectId, required: true }, voto: { type: String, enum: VOTOS, required: true } }, { _id: false })],
    default: [],
  },
  decision: {
    type: new Schema({ tipo: { type: String, enum: TODAS_LAS_DECISIONES, required: true }, fundamento: { type: String, trim: true, maxlength: 3000, default: '' } }, { _id: false }),
    default: null,
  },
  resultado_votacion: { type: Schema.Types.Mixed, default: null },
});

const compromisoSchema = new Schema<ICompromiso>({
  caso_id: { type: Schema.Types.ObjectId, default: null },
  student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  responsable_tipo: { type: String, enum: RESPONSABLES_COMPROMISO, required: true },
  responsable_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  responsable_nombre: { type: String, required: true, trim: true, maxlength: 120 },
  descripcion: { type: String, required: true, trim: true, maxlength: 1000 },
  fecha_limite: { type: Date, required: true },
  estado: { type: String, enum: ESTADOS_COMPROMISO, default: 'PENDIENTE' },
  seguimientos: {
    type: [new Schema({ fecha: { type: Date, required: true }, texto: { type: String, required: true, maxlength: 1000 }, por: { type: Schema.Types.ObjectId, ref: 'User', required: true } }, { _id: false })],
    default: [],
  },
});

const sesionSchema = new Schema<ISesionComision, SesionComisionModel>(
  {
    instancia: { type: String, enum: INSTANCIAS_SESION, required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    anio: { type: Number, required: true },
    alcance: {
      type: new Schema({ periodo_numero: { type: Number, min: 1, max: 12, default: null }, grados_ids: { type: [Schema.Types.ObjectId], default: [] } }, { _id: false }),
      default: () => ({}),
    },
    estado: { type: String, enum: ESTADOS_SESION, default: 'BORRADOR' },
    fecha: { type: Date, required: true },
    hora: { type: String, trim: true, default: '' },
    lugar: { type: String, trim: true, maxlength: 160, default: '' },
    orden_del_dia: { type: String, trim: true, maxlength: 8000, default: '' },
    convocada_at: { type: Date, default: null },
    miembros: { type: [miembroSchema], default: [] },
    casos: { type: [casoSchema], default: [] },
    compromisos: { type: [compromisoSchema], default: [] },
    desarrollo: { type: String, trim: true, maxlength: 8000, default: '' },
    conclusiones: { type: String, trim: true, maxlength: 8000, default: '' },
    quorum: { type: Schema.Types.Mixed, default: null },
    codigo: { type: String, default: null },
    consecutivo: { type: Number, default: null },
    hash: { type: String, default: null },
    firmada_at: { type: Date, default: null },
    anulacion: {
      type: new Schema({ motivo: { type: String, required: true }, por: { type: Schema.Types.ObjectId, ref: 'User', required: true }, fecha: { type: Date, required: true } }, { _id: false }),
      default: null,
    },
    creado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, minimize: false }
);

sesionSchema.index({ academic_year_id: 1, instancia: 1, fecha: -1 });
sesionSchema.index({ codigo: 1 }, { unique: true, partialFilterExpression: { codigo: { $type: 'string' } } });
sesionSchema.index({ 'miembros.user_id': 1 });

// Un acta firmada es inmutable: solo se sigue el cumplimiento de los compromisos (estado y seguimiento), que no entran a la huella.
sesionSchema.pre('save', function (next) {
  if (this.isNew) return next();
  if (this.estado === 'FIRMADA' && !this.isModified('estado')) {
    const intactos = this.modifiedPaths().every((p) => p.startsWith('compromisos') || p === 'updatedAt');
    if (!intactos) return next(new Error('Un acta firmada no se edita.'));
  }
  next();
});

export const SesionComision = model<ISesionComision, SesionComisionModel>('SesionComision', sesionSchema);
export default SesionComision;
