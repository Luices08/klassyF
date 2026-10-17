import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_NOTA_TRASLADO, EstadoNotaTraslado, TIPOS_ESCALA_EXTERNA, TipoEscalaExterna } from '../constants/traslados';

/** La escala con la que se convirtió, copiada: editar el catálogo no reescribe lo homologado. */
export interface IEscalaUsada {
  escala_externa_id: Types.ObjectId | null;
  nombre: string;
  tipo: TipoEscalaExterna | 'INSTITUCIONAL';
  valor_minimo: number | null;
  valor_maximo: number | null;
  valor_aprobatorio: number | null;
}

/** Una nota del certificado de origen y lo que vale aquí (la auditoría pide conservar ambas). */
export interface IFuenteNotaHomologada {
  /** Posición en `TrasladoExtemporaneo.periodos_origen`. */
  indice_origen: number;
  periodo_origen: string;
  valor_original: string;
  escala: IEscalaUsada;
  nota_convertida: number;
  peso: number;
}

export interface ICambioNotaHomologada {
  fecha: Date;
  por: Types.ObjectId;
  estado_anterior: EstadoNotaTraslado;
  nota_anterior: number | null;
  fuentes_anteriores: IFuenteNotaHomologada[];
  motivo: string;
}

/**
 * La definitiva de una asignatura en un periodo que el estudiante no cursó aquí (llegó después). Entra directo como definitiva del periodo:
 * no hay actividades ni casillas (M11/M12) detrás. HOMOLOGADA_EXTERNA trae la nota ya en la escala del año; EXENTA_POR_TRASLADO no tiene nota.
 */
export interface INotaHomologada {
  traslado_id: Types.ObjectId;
  student_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  subject_id: Types.ObjectId;
  periodo_numero: number;
  estado: EstadoNotaTraslado;
  /** En la escala institucional del año; null si es exenta. */
  nota: number | null;
  fuentes: IFuenteNotaHomologada[];
  /** Nombre de la asignatura en el certificado de origen, si no se llamaba igual. */
  asignatura_origen: string;
  /** La escala del año con la que se convirtió (también se audita). */
  escala_institucional: { nota_minima: number; nota_maxima: number; nota_aprobatoria: number; precision_decimales: number };
  /** Obligatorio en las exentas: por qué no se impartía. */
  motivo: string;
  registrado_por: Types.ObjectId;
  historial: ICambioNotaHomologada[];
  createdAt: Date;
  updatedAt: Date;
}

export type NotaHomologadaDocument = HydratedDocument<INotaHomologada>;
type NotaHomologadaModel = Model<INotaHomologada>;

const escalaUsadaSchema = new Schema<IEscalaUsada>(
  {
    escala_externa_id: { type: Schema.Types.ObjectId, ref: 'EscalaExterna', default: null },
    nombre: { type: String, required: true },
    tipo: { type: String, enum: [...TIPOS_ESCALA_EXTERNA, 'INSTITUCIONAL'], required: true },
    valor_minimo: { type: Number, default: null },
    valor_maximo: { type: Number, default: null },
    valor_aprobatorio: { type: Number, default: null },
  },
  { _id: false }
);

const fuenteSchema = new Schema<IFuenteNotaHomologada>(
  {
    indice_origen: { type: Number, required: true, min: 0 },
    periodo_origen: { type: String, required: true },
    valor_original: { type: String, required: true },
    escala: { type: escalaUsadaSchema, required: true },
    nota_convertida: { type: Number, required: true },
    peso: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false }
);

const notaHomologadaSchema = new Schema<INotaHomologada, NotaHomologadaModel>(
  {
    traslado_id: { type: Schema.Types.ObjectId, ref: 'TrasladoExtemporaneo', required: true },
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    subject_id: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    periodo_numero: { type: Number, required: true, min: 1 },
    estado: { type: String, enum: ESTADOS_NOTA_TRASLADO, required: true },
    nota: { type: Number, default: null },
    fuentes: { type: [fuenteSchema], default: [] },
    asignatura_origen: { type: String, default: '', trim: true },
    escala_institucional: {
      nota_minima: { type: Number, required: true },
      nota_maxima: { type: Number, required: true },
      nota_aprobatoria: { type: Number, required: true },
      precision_decimales: { type: Number, required: true },
    },
    motivo: { type: String, default: '', trim: true },
    registrado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    historial: {
      type: [
        new Schema(
          {
            fecha: { type: Date, required: true },
            por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            estado_anterior: { type: String, enum: ESTADOS_NOTA_TRASLADO, required: true },
            nota_anterior: { type: Number, default: null },
            fuentes_anteriores: { type: [fuenteSchema], default: [] },
            motivo: { type: String, default: '' },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

notaHomologadaSchema.index({ student_id: 1, academic_year_id: 1, subject_id: 1, periodo_numero: 1 }, { unique: true });
notaHomologadaSchema.index({ traslado_id: 1 });
notaHomologadaSchema.index({ academic_year_id: 1, periodo_numero: 1 });

// Una homologada siempre tiene nota y de dónde salió; una exenta no tiene nota y dice por qué.
notaHomologadaSchema.pre('validate', function coherencia(this: INotaHomologada, next) {
  if (this.estado === 'HOMOLOGADA_EXTERNA' && (this.nota === null || this.fuentes.length === 0)) {
    return next(new Error('Una nota homologada necesita su nota y al menos una nota de origen.'));
  }
  if (this.estado === 'EXENTA_POR_TRASLADO' && (this.nota !== null || !this.motivo.trim())) {
    return next(new Error('Una asignatura exenta no lleva nota y necesita el motivo.'));
  }
  next();
});

export const NotaHomologada = model<INotaHomologada, NotaHomologadaModel>('NotaHomologada', notaHomologadaSchema);
export default NotaHomologada;
