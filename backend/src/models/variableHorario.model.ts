import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_USUARIO, EstadoUsuario } from '../constants/enums';
import ApiError from '../utils/ApiError';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import Grade from './grade.model';
import {
  METADATOS_VARIABLE_HORARIO,
  PESO_MAX_VARIABLE,
  PESO_MIN_VARIABLE,
  SEVERIDADES_VARIABLE_HORARIO,
  SeveridadVariableHorario,
  TIPOS_ALCANCE_HORARIO,
  TIPOS_VARIABLE_HORARIO,
  TipoAlcanceHorario,
  TipoVariableHorario,
} from '../constants/horarios';

/**
 * M09: una restricción o preferencia del motor de horarios. Todas comparten la misma forma: un tipo, a quién aplica
 * (alcance + filtros de asignatura y docente) y unos parámetros propios del tipo (validados en la frontera por Joi,
 * ver validators/horario.validator.ts). Así una regla nueva es un tipo más en constants/horarios.ts, no una colección.
 *
 * Las variables son del año lectivo y de una jornada concreta (sede + jornada): las franjas y los días hábiles salen de
 * `JornadaOperativa`, y los periodos que nombra una celda de disponibilidad son los de esa jornada.
 */
export interface IAlcanceVariableHorario {
  tipo: TipoAlcanceHorario;
  /** Grados del catálogo `Grade` activo de la institución (M01). Vacío si el alcance es GLOBAL. */
  grade_ids: Types.ObjectId[];
}

export interface IVariableHorario {
  academic_year_id: Types.ObjectId;
  jornada_id: Types.ObjectId;
  tipo: TipoVariableHorario;
  descripcion: string;
  severidad: SeveridadVariableHorario;
  peso: number;
  alcance: IAlcanceVariableHorario;
  asignatura_ids: Types.ObjectId[];
  docente_ids: Types.ObjectId[];
  parametros: Record<string, unknown>;
  es_excepcion: boolean;
  estado: EstadoUsuario;
  creado_por: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type VariableHorarioDocument = HydratedDocument<IVariableHorario>;
type VariableHorarioModel = Model<IVariableHorario>;

const alcanceSchema = new Schema<IAlcanceVariableHorario>(
  {
    tipo: { type: String, enum: TIPOS_ALCANCE_HORARIO, required: true, default: 'GLOBAL' },
    grade_ids: { type: [{ type: Schema.Types.ObjectId, ref: 'Grade' }], default: [] },
  },
  { _id: false }
);

const variableHorarioSchema = new Schema<IVariableHorario, VariableHorarioModel>(
  {
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    jornada_id: { type: Schema.Types.ObjectId, ref: 'JornadaOperativa', required: true },
    tipo: { type: String, enum: TIPOS_VARIABLE_HORARIO, required: true },
    descripcion: { type: String, trim: true, default: '' },
    severidad: { type: String, enum: SEVERIDADES_VARIABLE_HORARIO, required: true },
    peso: { type: Number, min: PESO_MIN_VARIABLE, max: PESO_MAX_VARIABLE, default: 5 },
    alcance: { type: alcanceSchema, required: true, default: () => ({ tipo: 'GLOBAL' }) },
    asignatura_ids: { type: [{ type: Schema.Types.ObjectId, ref: 'Subject' }], default: [] },
    docente_ids: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    parametros: { type: Schema.Types.Mixed, default: {} },
    es_excepcion: { type: Boolean, default: false },
    estado: { type: String, enum: ESTADOS_USUARIO, default: 'activo' },
    creado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, minimize: false }
);

variableHorarioSchema.index({ academic_year_id: 1, jornada_id: 1, estado: 1 });

// Los grados se eligen del catálogo que esta institución tiene activo: un grado desactivado (ej. una institución sin
// preescolar) no puede recibir reglas nuevas. Solo se revisa al cambiar el alcance, para no invalidar variables viejas
// si después se desactiva un grado.
variableHorarioSchema.pre('validate', async function gradosDelCatalogoActivo(this: VariableHorarioDocument, next) {
  if (this.alcance.tipo !== 'GRADOS' || !this.isModified('alcance')) return next();
  const ids = [...new Set(this.alcance.grade_ids.map(String))];
  const activos = await Grade.countDocuments({ _id: { $in: ids }, estado: ESTADO_ACTIVO });
  if (activos !== ids.length) return next(new ApiError(400, 'Uno o más grados no existen o no están activos en esta institución.'));
  next();
});

variableHorarioSchema.pre('validate', function validarForma(this: IVariableHorario, next) {
  const meta = METADATOS_VARIABLE_HORARIO[this.tipo];
  const { alcance } = this;
  if (!meta.usaAlcance && alcance.tipo !== 'GLOBAL') {
    return next(new ApiError(400, 'Las variables de docente y las reuniones se filtran por docente, no por grado: su alcance es global.'));
  }
  if (alcance.tipo === 'GRADOS' && alcance.grade_ids.length === 0) return next(new ApiError(400, 'Elige al menos un grado.'));
  if (alcance.tipo === 'GLOBAL' && alcance.grade_ids.length > 0) alcance.grade_ids = [];
  if (meta.asignaturasExactas !== null && this.asignatura_ids.length !== meta.asignaturasExactas) {
    return next(new ApiError(400, `"${meta.etiqueta}" requiere exactamente ${meta.asignaturasExactas} asignatura(s).`));
  }
  next();
});

export const VariableHorario = model<IVariableHorario, VariableHorarioModel>('VariableHorario', variableHorarioSchema);
export default VariableHorario;
