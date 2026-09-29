import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  ESTADOS_ESTUDIANTE,
  EstadoEstudiante,
  GENEROS,
  Genero,
  GRUPOS_ETNICOS,
  GrupoEtnico,
  GRUPOS_SANGUINEOS,
  GrupoSanguineo,
  REGIMENES_SALUD,
  RegimenSalud,
} from '../constants/enums';

export interface IStudentProfile {
  user_id: Types.ObjectId;
  // Identificacion
  lugar_expedicion?: string;
  fecha_nacimiento: Date;
  genero?: Genero;
  // Salud
  eps?: string;
  regimen_salud?: RegimenSalud;
  rh?: GrupoSanguineo;
  alergias_condiciones?: string;
  // Ubicacion
  direccion_residencia?: string;
  barrio_vereda?: string;
  municipio?: string;
  estrato?: number;
  // Poblacion y vulnerabilidad
  grupo_etnico: GrupoEtnico;
  victima_conflicto: boolean;
  tiene_discapacidad: boolean;
  tiene_talento_excepcional: boolean;
  /** Notas de inclusion para el futuro M16 (PIAR); no es el PIAR en si. */
  descripcion_inclusion?: string;
  // Trayectoria
  institucion_procedencia?: string;
  estado: EstadoEstudiante;
  createdAt: Date;
  updatedAt: Date;
}

export type StudentProfileDocument = HydratedDocument<IStudentProfile>;
type StudentProfileModel = Model<IStudentProfile>;

const studentProfileSchema = new Schema<IStudentProfile, StudentProfileModel>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    lugar_expedicion: { type: String, trim: true },
    fecha_nacimiento: { type: Date, required: true },
    genero: { type: String, enum: GENEROS },
    eps: { type: String, trim: true },
    regimen_salud: { type: String, enum: REGIMENES_SALUD },
    rh: { type: String, enum: GRUPOS_SANGUINEOS },
    alergias_condiciones: { type: String, trim: true },
    direccion_residencia: { type: String, trim: true },
    barrio_vereda: { type: String, trim: true },
    municipio: { type: String, trim: true },
    estrato: { type: Number, min: 1, max: 6 },
    grupo_etnico: { type: String, enum: GRUPOS_ETNICOS, default: 'NINGUNO' },
    victima_conflicto: { type: Boolean, default: false },
    tiene_discapacidad: { type: Boolean, default: false },
    tiene_talento_excepcional: { type: Boolean, default: false },
    descripcion_inclusion: { type: String, trim: true },
    institucion_procedencia: { type: String, trim: true },
    estado: { type: String, enum: ESTADOS_ESTUDIANTE, default: 'ACTIVO' },
  },
  { timestamps: true }
);

export const StudentProfile = model<IStudentProfile, StudentProfileModel>('StudentProfile', studentProfileSchema);
export default StudentProfile;
