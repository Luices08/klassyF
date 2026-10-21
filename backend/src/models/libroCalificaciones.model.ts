import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';

/**
 * El libro de calificaciones (registro escolar consolidado, art. 16 del Decreto 1290): lo definitivo del año de un grado en una sede, foliado y listo
 * para archivo. Se emite una vez con el cierre de promoción ya hecho, congela lo que dice (`snapshot`) y lleva una huella SHA-256 que permite saber si
 * alguien lo alteró directo en la base. Es inmutable: un libro mal emitido se **anula con motivo** y se emite otro con folios nuevos (los de uno anulado
 * no se reutilizan, así el archivo no queda con números repetidos).
 */
export interface ILibroCalificaciones {
  academic_year_id: Types.ObjectId;
  sede_id: Types.ObjectId;
  grade_id: Types.ObjectId;
  anio: number;
  /** `LC-2026-001`: consecutivo anual sin huecos. */
  codigo: string;
  consecutivo: number;
  /** Los folios (hojas numeradas) que ocupa en el archivo de la institución en ese año. */
  folio_inicial: number;
  folio_final: number;
  snapshot: unknown;
  huella: string;
  estado: 'VIGENTE' | 'ANULADO';
  anulacion: { motivo: string; por: Types.ObjectId; fecha: Date } | null;
  emitido_por: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type LibroCalificacionesDocument = HydratedDocument<ILibroCalificaciones>;
type LibroCalificacionesModel = Model<ILibroCalificaciones>;

const libroSchema = new Schema<ILibroCalificaciones, LibroCalificacionesModel>(
  {
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    sede_id: { type: Schema.Types.ObjectId, ref: 'Campus', required: true },
    grade_id: { type: Schema.Types.ObjectId, ref: 'Grade', required: true },
    anio: { type: Number, required: true },
    codigo: { type: String, required: true, unique: true },
    consecutivo: { type: Number, required: true },
    folio_inicial: { type: Number, required: true, min: 1 },
    folio_final: { type: Number, required: true, min: 1 },
    // `minimize: false` más abajo: el contenido congelado se guarda tal cual, sin quitar objetos vacíos, o la huella no coincidiría al recalcularla.
    snapshot: { type: Schema.Types.Mixed, required: true },
    huella: { type: String, required: true },
    estado: { type: String, enum: ['VIGENTE', 'ANULADO'], default: 'VIGENTE' },
    anulacion: {
      type: new Schema({ motivo: { type: String, required: true }, por: { type: Schema.Types.ObjectId, ref: 'User', required: true }, fecha: { type: Date, required: true } }, { _id: false }),
      default: null,
    },
    emitido_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, minimize: false }
);

// Un solo libro vigente por año, sede y grado: para emitir otro hay que anular el anterior.
libroSchema.index({ academic_year_id: 1, sede_id: 1, grade_id: 1 }, { unique: true, partialFilterExpression: { estado: 'VIGENTE' }, name: 'libro_vigente_unico' });
libroSchema.index({ anio: 1, consecutivo: 1 }, { unique: true });

// Lo emitido no se edita: solo cambian el estado y la anulación.
libroSchema.pre('save', function (next) {
  if (this.isNew) return next();
  const intactos = this.modifiedPaths().every((p) => p === 'estado' || p.startsWith('anulacion') || p === 'updatedAt');
  if (!intactos) return next(new Error('Un libro de calificaciones emitido no se edita: se anula y se emite otro.'));
  next();
});

export const LibroCalificaciones = model<ILibroCalificaciones, LibroCalificacionesModel>('LibroCalificaciones', libroSchema);
export default LibroCalificaciones;
