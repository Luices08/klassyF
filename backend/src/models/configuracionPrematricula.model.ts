import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';

/**
 * La ventana de prematrícula de un año lectivo (M04): mientras está abierta, las solicitudes de admisión apuntan a ESE año (el siguiente) en vez de al año
 * en curso, y se les puede reservar cupo por grado, sede y jornada. Es del colegio: una por año, con sus fechas. Vive aparte del año lectivo (M05) para no
 * tocar su calendario. Las fechas son de calendario (medianoche UTC, como el resto del sistema) y el cierre es inclusivo.
 */
export interface IConfiguracionPrematricula {
  academic_year_id: Types.ObjectId;
  desde: Date;
  hasta: Date;
  /** Último día para matricular a quien tiene cupo reservado; pasado, el cupo no reclamado se libera. null = sin límite. */
  fecha_limite_matricula: Date | null;
  actualizado_por: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ConfiguracionPrematriculaDocument = HydratedDocument<IConfiguracionPrematricula>;
type ConfiguracionPrematriculaModel = Model<IConfiguracionPrematricula>;

const configuracionSchema = new Schema<IConfiguracionPrematricula, ConfiguracionPrematriculaModel>(
  {
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true, unique: true },
    desde: { type: Date, required: true },
    hasta: { type: Date, required: true },
    fecha_limite_matricula: { type: Date, default: null },
    actualizado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

export const ConfiguracionPrematricula = model<IConfiguracionPrematricula, ConfiguracionPrematriculaModel>('ConfiguracionPrematricula', configuracionSchema);
export default ConfiguracionPrematricula;
