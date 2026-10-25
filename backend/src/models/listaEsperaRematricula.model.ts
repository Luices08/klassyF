import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_ESPERA_REMATRICULA, EstadoEsperaRematricula } from '../constants/rematricula';

/**
 * Estudiante a quien le corresponde cupo en el año siguiente pero que no lo obtuvo porque los grupos de su grado se llenaron con quienes
 * tienen más prioridad. No es una matrícula ni un estado de `Enrollment` (M04 no se toca): es la cola de la que la dirección asigna a mano
 * cuando se libera o se crea un cupo; asignar crea la pre-matrícula normal.
 */
export interface IListaEsperaRematricula {
  student_id: Types.ObjectId;
  origen_academic_year_id: Types.ObjectId;
  destino_academic_year_id: Types.ObjectId;
  enrollment_origen_id: Types.ObjectId;
  sede_id: Types.ObjectId;
  jornada_id: Types.ObjectId | null;
  grado_destino_id: Types.ObjectId;
  tipo_ingreso: 'ANTIGUO' | 'REPITENTE';
  /** Texto del grupo de origen, copiado para mostrarlo sin releer el año anterior. */
  grupo_origen: string;
  /** Lugar en la cola de su sede y grado, según los criterios de prioridad vigentes al calcularla. */
  posicion: number;
  estado: EstadoEsperaRematricula;
  /** Matrícula creada al asignarlo. */
  enrollment_id: Types.ObjectId | null;
  motivo: string;
  resuelta_por: Types.ObjectId | null;
  resuelta_at: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ListaEsperaRematriculaDocument = HydratedDocument<IListaEsperaRematricula>;
type ListaEsperaRematriculaModel = Model<IListaEsperaRematricula>;

const esperaSchema = new Schema<IListaEsperaRematricula, ListaEsperaRematriculaModel>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    origen_academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    destino_academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    enrollment_origen_id: { type: Schema.Types.ObjectId, ref: 'Enrollment', required: true },
    sede_id: { type: Schema.Types.ObjectId, ref: 'Campus', required: true },
    jornada_id: { type: Schema.Types.ObjectId, ref: 'JornadaOperativa', default: null },
    grado_destino_id: { type: Schema.Types.ObjectId, ref: 'Grade', required: true },
    tipo_ingreso: { type: String, enum: ['ANTIGUO', 'REPITENTE'], required: true },
    grupo_origen: { type: String, default: '' },
    posicion: { type: Number, required: true, min: 1 },
    estado: { type: String, enum: ESTADOS_ESPERA_REMATRICULA, default: 'EN_ESPERA' },
    enrollment_id: { type: Schema.Types.ObjectId, ref: 'Enrollment', default: null },
    motivo: { type: String, trim: true, default: '' },
    resuelta_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resuelta_at: { type: Date, default: null },
  },
  { timestamps: true }
);

// Un estudiante espera una sola vez por año de destino; lo ya resuelto queda como historia.
esperaSchema.index({ student_id: 1, destino_academic_year_id: 1 }, { unique: true, partialFilterExpression: { estado: 'EN_ESPERA' }, name: 'espera_vigente_unica' });
esperaSchema.index({ destino_academic_year_id: 1, sede_id: 1, grado_destino_id: 1, estado: 1, posicion: 1 });

export const ListaEsperaRematricula = model<IListaEsperaRematricula, ListaEsperaRematriculaModel>('ListaEsperaRematricula', esperaSchema);
export default ListaEsperaRematricula;
