import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';

export interface ISoporteTraslado {
  _id: Types.ObjectId;
  nombre: string;
  archivo_path: string;
  mimetype: string;
  tamano: number;
  cargado_por: Types.ObjectId;
  fecha: Date;
}

/** Qué periodos de origen alimentan un periodo local y con qué peso (0–100). */
export interface ICorrespondenciaPeriodo {
  periodo_numero: number;
  fuentes: Array<{ indice_origen: number; peso: number }>;
}

export interface IPeriodoOrigen {
  nombre: string;
  fecha_inicio: Date | null;
  fecha_fin: Date | null;
}

/**
 * El evento de ingreso extemporáneo o por traslado de una matrícula (M04): cuándo llegó, en qué periodo local empezó a cursar, de dónde
 * viene y con qué esquema de periodos y escala evaluaba su institución de procedencia. Los periodos anteriores al de ingreso no los califica
 * ningún docente (M12 los saca de la planilla): los registra secretaría como notas homologadas (`NotaHomologada`).
 * `student_id` y `academic_year_id` se copian de la matrícula (no cambian) para consultar sin cruzarla.
 */
export interface ITrasladoExtemporaneo {
  enrollment_id: Types.ObjectId;
  student_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  fecha_ingreso: Date;
  /** Primer periodo del año que el estudiante cursa en el colegio. */
  periodo_ingreso: number;
  institucion_procedencia: { nombre: string; codigo_dane: string; municipio: string; calendario: string };
  /** Cómo dividía el año la institución de procedencia (3 trimestres, 2 semestres...), en orden. */
  periodos_origen: Types.DocumentArray<IPeriodoOrigen>;
  /** Vacío = la sugerida (`sugerirCorrespondencia`, por fechas o por partes iguales); se guarda solo si secretaría la ajusta. */
  correspondencia: Types.DocumentArray<ICorrespondenciaPeriodo>;
  /** Escala de origen con la que se proponen las conversiones; cada nota puede usar otra. null = ya venía en la escala del colegio. */
  escala_externa_id: Types.ObjectId | null;
  observaciones: string;
  soportes: Types.DocumentArray<ISoporteTraslado>;
  registrado_por: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type TrasladoExtemporaneoDocument = HydratedDocument<ITrasladoExtemporaneo>;
type TrasladoExtemporaneoModel = Model<ITrasladoExtemporaneo>;

const trasladoSchema = new Schema<ITrasladoExtemporaneo, TrasladoExtemporaneoModel>(
  {
    enrollment_id: { type: Schema.Types.ObjectId, ref: 'Enrollment', required: true },
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    fecha_ingreso: { type: Date, required: true },
    periodo_ingreso: { type: Number, required: true, min: 1 },
    institucion_procedencia: {
      nombre: { type: String, required: true, trim: true },
      codigo_dane: { type: String, default: '', trim: true },
      municipio: { type: String, default: '', trim: true },
      calendario: { type: String, default: '', trim: true },
    },
    periodos_origen: {
      type: [new Schema({ nombre: { type: String, required: true, trim: true }, fecha_inicio: { type: Date, default: null }, fecha_fin: { type: Date, default: null } }, { _id: false })],
      default: [],
    },
    correspondencia: {
      type: [
        new Schema(
          {
            periodo_numero: { type: Number, required: true, min: 1 },
            fuentes: {
              type: [new Schema({ indice_origen: { type: Number, required: true, min: 0 }, peso: { type: Number, required: true, min: 0, max: 100 } }, { _id: false })],
              default: [],
            },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    escala_externa_id: { type: Schema.Types.ObjectId, ref: 'EscalaExterna', default: null },
    observaciones: { type: String, default: '', trim: true },
    soportes: {
      type: [
        new Schema({
          nombre: { type: String, required: true },
          archivo_path: { type: String, required: true },
          mimetype: { type: String, required: true },
          tamano: { type: Number, required: true },
          cargado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          fecha: { type: Date, required: true },
        }),
      ],
      default: [],
    },
    registrado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Un traslado por matrícula: un cambio de fecha o de procedencia corrige el mismo registro.
trasladoSchema.index({ enrollment_id: 1 }, { unique: true });
// M12/M17/M18: «¿quién del año llegó después de este periodo?».
trasladoSchema.index({ academic_year_id: 1, periodo_ingreso: 1 });
trasladoSchema.index({ student_id: 1, academic_year_id: 1 });

export const TrasladoExtemporaneo = model<ITrasladoExtemporaneo, TrasladoExtemporaneoModel>('TrasladoExtemporaneo', trasladoSchema);
export default TrasladoExtemporaneo;
