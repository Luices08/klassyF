import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_ANTICIPADA, EstadoAnticipada, MEDIOS_CONSENTIMIENTO, MODOS_NOTA_PERIODO, MedioConsentimiento, ModoNotaPeriodo, TIPOS_ANTICIPADA, TRATAMIENTOS_NOTAS, TipoAnticipada, TratamientoNotas } from '../constants/promocionAnticipada';
import { PasosExigidos } from '../utils/promocionAnticipada';

export interface INotaPeriodoAplicada {
  subject_id: Types.ObjectId;
  nombre: string;
  modo: ModoNotaPeriodo;
  nota: number | null;
  motivo: string;
  /** Solo en NIVELACION: la nota que registra el docente o coordinación cuando el estudiante nivela. */
  nivelacion: { nota: number; fecha: Date; por: Types.ObjectId } | null;
}

/**
 * Un trámite de promoción anticipada de un estudiante (M19, fase 6). Guarda los criterios con que se evaluó (un cambio posterior de la
 * configuración no reescribe un trámite en curso), cada paso con la referencia del acta que lo respalda, la resolución rectoral y, al
 * aplicarse, cómo quedó el trato de las notas de los periodos no cursados.
 */
export interface IPromocionAnticipada {
  academic_year_id: Types.ObjectId;
  anio: number;
  student_id: Types.ObjectId;
  enrollment_id: Types.ObjectId;
  grupo_origen_id: Types.ObjectId;
  grado_origen_id: Types.ObjectId;
  tipo: TipoAnticipada;
  estado: EstadoAnticipada;
  motivo_solicitud: string;
  /** Pasos exigidos y trato de notas vigentes cuando se abrió el trámite. */
  reglas: { exige: PasosExigidos; tratamiento_notas: TratamientoNotas; periodo_evaluacion: number };
  evaluacion: { periodo: number; promedio: number | null; cumple: boolean; motivos: string[]; notas: Array<{ subject_id: string; nombre: string; nota: number | null }> };
  concepto_comision: { sesion_id: Types.ObjectId; acta: string; favorable: boolean; fecha: Date } | null;
  consentimiento: { otorgado: boolean; medio: MedioConsentimiento; otorgado_por: { guardian_id: Types.ObjectId | null; nombre: string; documento: string }; observaciones: string; fecha: Date; registrado_por: Types.ObjectId } | null;
  decision_consejo: { sesion_id: Types.ObjectId; acta: string; aprobada: boolean; fecha: Date } | null;
  resolucion: { codigo: string; consecutivo: number; fecha: Date; fundamento: string; emitida_por: Types.ObjectId; hash: string } | null;
  aplicacion: { fecha: Date; grupo_destino_id: Types.ObjectId; grado_destino_id: Types.ObjectId; por: Types.ObjectId; notas: INotaPeriodoAplicada[] } | null;
  cierre: { estado: 'RECHAZADA' | 'ANULADA'; motivo: string; por: Types.ObjectId | null; fecha: Date } | null;
  solicitada_por: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type PromocionAnticipadaDocument = HydratedDocument<IPromocionAnticipada>;
type PromocionAnticipadaModel = Model<IPromocionAnticipada>;

const sub = (definicion: Record<string, unknown>) => new Schema(definicion, { _id: false });

const notaAplicadaSchema = new Schema<INotaPeriodoAplicada>({
  subject_id: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
  nombre: { type: String, required: true },
  modo: { type: String, enum: MODOS_NOTA_PERIODO, required: true },
  nota: { type: Number, default: null },
  motivo: { type: String, default: '' },
  nivelacion: { type: sub({ nota: { type: Number, required: true }, fecha: { type: Date, required: true }, por: { type: Schema.Types.ObjectId, ref: 'User', required: true } }), default: null },
});

const schema = new Schema<IPromocionAnticipada, PromocionAnticipadaModel>(
  {
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    anio: { type: Number, required: true },
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    enrollment_id: { type: Schema.Types.ObjectId, ref: 'Enrollment', required: true },
    grupo_origen_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    grado_origen_id: { type: Schema.Types.ObjectId, ref: 'Grade', required: true },
    tipo: { type: String, enum: TIPOS_ANTICIPADA, required: true },
    estado: { type: String, enum: ESTADOS_ANTICIPADA, default: 'SOLICITADA' },
    motivo_solicitud: { type: String, trim: true, maxlength: 3000, default: '' },
    reglas: {
      type: sub({
        exige: { type: Schema.Types.Mixed, required: true },
        tratamiento_notas: { type: String, enum: TRATAMIENTOS_NOTAS, required: true },
        periodo_evaluacion: { type: Number, required: true },
      }),
      required: true,
    },
    evaluacion: { type: Schema.Types.Mixed, required: true },
    concepto_comision: { type: Schema.Types.Mixed, default: null },
    consentimiento: {
      type: sub({
        otorgado: { type: Boolean, required: true },
        medio: { type: String, enum: MEDIOS_CONSENTIMIENTO, required: true },
        otorgado_por: { type: Schema.Types.Mixed, required: true },
        observaciones: { type: String, trim: true, maxlength: 1000, default: '' },
        fecha: { type: Date, required: true },
        registrado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      }),
      default: null,
    },
    decision_consejo: { type: Schema.Types.Mixed, default: null },
    resolucion: { type: Schema.Types.Mixed, default: null },
    aplicacion: {
      type: sub({
        fecha: { type: Date, required: true },
        grupo_destino_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
        grado_destino_id: { type: Schema.Types.ObjectId, ref: 'Grade', required: true },
        por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        notas: { type: [notaAplicadaSchema], default: [] },
      }),
      default: null,
    },
    cierre: { type: Schema.Types.Mixed, default: null },
    solicitada_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, minimize: false }
);

// Un estudiante tiene a lo sumo un trámite vivo (o ya aplicado) por año: rechazado o anulado permite volver a intentar.
schema.index({ academic_year_id: 1, student_id: 1 }, { unique: true, partialFilterExpression: { estado: { $in: ['SOLICITADA', 'LISTA_PARA_RESOLUCION', 'RESUELTA', 'APLICADA'] } } });
schema.index({ 'resolucion.codigo': 1 }, { unique: true, partialFilterExpression: { 'resolucion.codigo': { $type: 'string' } } });
schema.index({ academic_year_id: 1, estado: 1 });

export const PromocionAnticipada = model<IPromocionAnticipada, PromocionAnticipadaModel>('PromocionAnticipada', schema);
export default PromocionAnticipada;
