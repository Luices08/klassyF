import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_HORARIO, EstadoHorario } from '../constants/horarios';
import ApiError from '../utils/ApiError';

/**
 * M09: una versión del horario de una jornada (sede + jornada) en un año lectivo. Cada generación crea una versión en
 * BORRADOR; las ediciones manuales la modifican y se revalida; publicarla archiva la anterior. Solo una PUBLICADA por
 * año + jornada (índice parcial). Las sesiones se embeben: son cientos por versión y siempre se leen juntas.
 *
 * Una sesión guarda una foto de su docente/grupo/asignatura además de `asignacion_id`: si después se cambia la carga en
 * M08, la versión publicada sigue mostrando lo que se publicó y la diferencia se reporta como "desactualizada".
 */
export interface ISesionHorario {
  _id: Types.ObjectId;
  /** Id estable del motor (`<asignacion>#<k>` o `<variable reunión>#<k>`): enlaza ediciones y regeneraciones. */
  clave: string;
  asignacion_id: Types.ObjectId | null;
  reunion_variable_id: Types.ObjectId | null;
  group_id: Types.ObjectId | null;
  subject_id: Types.ObjectId | null;
  docente_ids: Types.ObjectId[];
  /** Día ISO (1 = lunes). */
  dia: number;
  /** Índice (0…) entre las franjas de CLASE de la jornada. */
  periodo: number;
  duracion: number;
  espacio_id: Types.ObjectId | null;
  /** Fijada a mano: una regeneración la respeta. */
  fija: boolean;
}

export interface IIncidenciaHorario {
  codigo: string;
  variable_id: Types.ObjectId | null;
  dura: boolean;
  magnitud: number;
  claves_sesion: string[];
  mensaje: string;
}

export interface IHorario {
  academic_year_id: Types.ObjectId;
  sede_id: Types.ObjectId;
  jornada_id: Types.ObjectId;
  version: number;
  nombre: string;
  estado: EstadoHorario;
  sesiones: ISesionHorario[];
  conflictos_duros: number;
  penalizacion_blanda: number;
  incidencias: IIncidenciaHorario[];
  /** Avisos de insumos (bloques que no cuadran, simultáneas que no emparejan...). */
  avisos: Array<{ codigo: string; mensaje: string }>;
  generacion: { semilla: number; iteraciones: number; duracion_ms: number } | null;
  /** Por qué falló la generación (estado FALLIDO). */
  error_generacion: string | null;
  /** Huella de las franjas de la jornada al generar: si cambian, las posiciones guardadas ya no significan lo mismo. */
  huella_franjas: string;
  creado_por: Types.ObjectId;
  publicado_por: Types.ObjectId | null;
  publicado_en: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type HorarioDocument = HydratedDocument<IHorario>;
type HorarioModel = Model<IHorario>;

const sesionSchema = new Schema<ISesionHorario>({
  clave: { type: String, required: true },
  asignacion_id: { type: Schema.Types.ObjectId, ref: 'TeacherAssignment', default: null },
  reunion_variable_id: { type: Schema.Types.ObjectId, ref: 'VariableHorario', default: null },
  group_id: { type: Schema.Types.ObjectId, ref: 'Group', default: null },
  subject_id: { type: Schema.Types.ObjectId, ref: 'Subject', default: null },
  docente_ids: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
  dia: { type: Number, required: true, min: 1, max: 7 },
  periodo: { type: Number, required: true, min: 0 },
  duracion: { type: Number, required: true, min: 1 },
  espacio_id: { type: Schema.Types.ObjectId, ref: 'Espacio', default: null },
  fija: { type: Boolean, default: false },
});

const incidenciaSchema = new Schema<IIncidenciaHorario>(
  {
    codigo: { type: String, required: true },
    variable_id: { type: Schema.Types.ObjectId, ref: 'VariableHorario', default: null },
    dura: { type: Boolean, required: true },
    magnitud: { type: Number, required: true },
    claves_sesion: { type: [String], default: [] },
    mensaje: { type: String, required: true },
  },
  { _id: false }
);

const generacionSchema = new Schema<NonNullable<IHorario['generacion']>>(
  { semilla: Number, iteraciones: Number, duracion_ms: Number },
  { _id: false }
);

const horarioSchema = new Schema<IHorario, HorarioModel>(
  {
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    sede_id: { type: Schema.Types.ObjectId, ref: 'Campus', required: true },
    jornada_id: { type: Schema.Types.ObjectId, ref: 'JornadaOperativa', required: true },
    version: { type: Number, required: true, min: 1 },
    nombre: { type: String, trim: true, default: '' },
    estado: { type: String, enum: ESTADOS_HORARIO, default: 'GENERANDO' },
    sesiones: { type: [sesionSchema], default: [] },
    conflictos_duros: { type: Number, default: 0 },
    penalizacion_blanda: { type: Number, default: 0 },
    incidencias: { type: [incidenciaSchema], default: [] },
    avisos: { type: [{ codigo: String, mensaje: String, _id: false }], default: [] },
    generacion: { type: generacionSchema, default: null },
    error_generacion: { type: String, default: null },
    huella_franjas: { type: String, required: true },
    creado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    publicado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    publicado_en: { type: Date, default: null },
  },
  { timestamps: true }
);

horarioSchema.index({ academic_year_id: 1, jornada_id: 1, version: 1 }, { unique: true });
horarioSchema.index(
  { academic_year_id: 1, jornada_id: 1 },
  { unique: true, partialFilterExpression: { estado: 'PUBLICADO' } }
);

horarioSchema.pre('validate', function noPublicarConConflictos(this: IHorario, next) {
  if (this.estado === 'PUBLICADO' && this.conflictos_duros > 0) {
    return next(new ApiError(409, 'Un horario con conflictos duros no se puede publicar.'));
  }
  next();
});

export const Horario = model<IHorario, HorarioModel>('Horario', horarioSchema);
export default Horario;
