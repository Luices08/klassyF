import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_TITULACION, EstadoTitulacion, REQUISITOS_TITULACION, RequisitoTitulacion } from '../constants/titulacion';

/** El asiento del acta de grado en el libro del colegio. Se asigna una sola vez, al expedir el primer documento de titulación (acta o diploma). */
export interface ActaDeGrado {
  codigo: string;
  consecutivo: number;
  anio: number;
  libro: number;
  folio: number;
  fecha: Date;
}

/**
 * Situación de titulación de un estudiante en el año en que cursó el último grado (M26/M19). Es aparte del cierre académico del año, que es
 * inmutable: cumplir el servicio social meses después cambia ESTE registro (a GRADUADO_EXTEMPORANEO) sin reescribir el año ya cerrado.
 * Cada cambio de estado queda en `historial`. Es la fuente que M26 consulta para expedir el acta de grado y el diploma.
 */
export interface ITitulacion {
  student_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  enrollment_id: Types.ObjectId;
  group_id: Types.ObjectId;
  /** Título que se otorga, resuelto al evaluar: el del grupo o, si no tiene, el de la institución (M01). */
  titulo: string;
  estado: EstadoTitulacion;
  acta: ActaDeGrado | null;
  pendientes: Array<{ requisito: RequisitoTitulacion; detalle: string }>;
  historial: Array<{ estado: EstadoTitulacion; fecha: Date; motivo: string; por: Types.ObjectId | null }>;
  createdAt: Date;
  updatedAt: Date;
}

export type TitulacionDocument = HydratedDocument<ITitulacion>;
type TitulacionModel = Model<ITitulacion>;

const titulacionSchema = new Schema<ITitulacion, TitulacionModel>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    enrollment_id: { type: Schema.Types.ObjectId, ref: 'Enrollment', required: true },
    group_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    titulo: { type: String, required: true, trim: true },
    estado: { type: String, enum: ESTADOS_TITULACION, required: true },
    acta: {
      type: new Schema(
        {
          codigo: { type: String, required: true },
          consecutivo: { type: Number, required: true },
          anio: { type: Number, required: true },
          libro: { type: Number, required: true },
          folio: { type: Number, required: true },
          fecha: { type: Date, required: true },
        },
        { _id: false }
      ),
      default: null,
    },
    pendientes: {
      type: [new Schema({ requisito: { type: String, enum: REQUISITOS_TITULACION, required: true }, detalle: { type: String, required: true } }, { _id: false })],
      default: [],
    },
    historial: {
      type: [
        new Schema(
          {
            estado: { type: String, enum: ESTADOS_TITULACION, required: true },
            fecha: { type: Date, required: true },
            motivo: { type: String, default: '' },
            por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

titulacionSchema.index({ student_id: 1, academic_year_id: 1 }, { unique: true });
titulacionSchema.index({ academic_year_id: 1, estado: 1 });
titulacionSchema.index({ enrollment_id: 1 });
// Un libro no repite folio: el asiento de cada acta es único.
titulacionSchema.index({ 'acta.libro': 1, 'acta.folio': 1 }, { unique: true, partialFilterExpression: { 'acta.libro': { $type: 'number' } } });

export const Titulacion = model<ITitulacion, TitulacionModel>('Titulacion', titulacionSchema);
export default Titulacion;
