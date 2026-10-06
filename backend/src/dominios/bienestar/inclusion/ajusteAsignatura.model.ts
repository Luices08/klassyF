import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  CATEGORIAS_AJUSTE,
  CategoriaAjuste,
  EFECTIVIDAD_AJUSTE,
  EfectividadAjuste,
  MAX_TEXTO_CORTO,
  MAX_TEXTO_LARGO,
  TIPOS_BARRERA,
  TipoBarrera,
} from './inclusion.constants';

export interface ISeguimientoAjuste {
  periodo_numero: number;
  fecha: Date;
  efectividad: EfectividadAjuste;
  observacion: string;
  nueva_accion: string;
  por: Types.ObjectId;
}

export interface IEdicionAjuste {
  por: Types.ObjectId;
  fecha: Date;
  /** Versión del expediente en que se editó (sube si el expediente ya estaba ACTIVO). */
  version_expediente: number;
}

/**
 * Fila del Anexo 2 (PIAR) para una asignatura. Se liga a (expediente, asignatura), NO a un docente: el docente se reemplaza durante
 * el año (M08) y el ajuste sigue. Quién puede editarlo lo decide la `TeacherAssignment` vigente; la autoría queda en `ediciones`.
 */
export interface IAjusteAsignatura {
  expediente_id: Types.ObjectId;
  subject_id: Types.ObjectId;
  /** Objetivos del grado (M07): se eligen del banco por `_id`, el docente no escribe un DBA. */
  dba_ids: Types.ObjectId[];
  objetivo_flexibilizado: string;
  barrera_asignatura: string;
  tipos_barrera: TipoBarrera[];
  ajuste_metodologico: string;
  ajuste_evaluativo: string;
  categorias_ajuste: CategoriaAjuste[];
  recursos: string;
  seguimientos: Types.DocumentArray<ISeguimientoAjuste>;
  ediciones: IEdicionAjuste[];
  createdAt: Date;
  updatedAt: Date;
}

export type AjusteAsignaturaDocument = HydratedDocument<IAjusteAsignatura>;
type AjusteAsignaturaModel = Model<IAjusteAsignatura>;

const largo = { type: String, trim: true, maxlength: MAX_TEXTO_LARGO, default: '' };

const ajusteSchema = new Schema<IAjusteAsignatura, AjusteAsignaturaModel>(
  {
    expediente_id: { type: Schema.Types.ObjectId, ref: 'ExpedienteInclusion', required: true },
    subject_id: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    dba_ids: { type: [{ type: Schema.Types.ObjectId, ref: 'ReferenteCurricular' }], default: [] },
    objetivo_flexibilizado: largo,
    barrera_asignatura: largo,
    tipos_barrera: { type: [{ type: String, enum: TIPOS_BARRERA }], default: [] },
    ajuste_metodologico: largo,
    ajuste_evaluativo: largo,
    categorias_ajuste: { type: [{ type: String, enum: CATEGORIAS_AJUSTE }], default: [] },
    recursos: largo,
    seguimientos: {
      type: [
        new Schema<ISeguimientoAjuste>({
          periodo_numero: { type: Number, required: true, min: 1, max: 4 },
          fecha: { type: Date, required: true },
          efectividad: { type: String, enum: EFECTIVIDAD_AJUSTE, required: true },
          observacion: { type: String, trim: true, maxlength: MAX_TEXTO_LARGO, default: '' },
          nueva_accion: { type: String, trim: true, maxlength: MAX_TEXTO_CORTO, default: '' },
          por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        }),
      ],
      default: [],
    },
    ediciones: {
      type: [
        new Schema<IEdicionAjuste>(
          {
            por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            fecha: { type: Date, required: true },
            version_expediente: { type: Number, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

ajusteSchema.index({ expediente_id: 1, subject_id: 1 }, { unique: true });

export const AjusteAsignatura = model<IAjusteAsignatura, AjusteAsignaturaModel>('AjusteAsignatura', ajusteSchema);
export default AjusteAsignatura;
