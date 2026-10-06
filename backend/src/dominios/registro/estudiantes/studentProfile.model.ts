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
} from '../../../constants/enums';
import { tieneDatoSaludSensible } from './datosSensibles';

/**
 * Autorizacion explicita para tratar datos sensibles de salud (Ley 1581 de
 * 2012, art. 6 lit. a; art. 7 para datos de ninos/adolescentes: la autoriza
 * el responsable legal, no el estudiante). No es un consentimiento generico
 * de matricula: cubre especificamente eps/rh/regimen_salud/alergias_condiciones.
 */
export interface IAutorizacionDatosSensibles {
  otorgada: boolean;
  /** Nombre de quien autoriza (acudiente/responsable legal), segun el formulario fisico de matricula. */
  otorgado_por_nombre: string | null;
  fecha: Date | null;
  /** Funcionario que lo registro en el sistema (trazabilidad, no quien autoriza). */
  registrado_por_id: Types.ObjectId | null;
}

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
  autorizacion_datos_sensibles: IAutorizacionDatosSensibles;
  createdAt: Date;
  updatedAt: Date;
}

export type StudentProfileDocument = HydratedDocument<IStudentProfile>;
type StudentProfileModel = Model<IStudentProfile>;

const autorizacionDatosSensiblesSchema = new Schema<IAutorizacionDatosSensibles>(
  {
    otorgada: { type: Boolean, default: false },
    otorgado_por_nombre: { type: String, default: null, trim: true },
    fecha: { type: Date, default: null },
    registrado_por_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false }
);

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
    autorizacion_datos_sensibles: { type: autorizacionDatosSensiblesSchema, default: () => ({}) },
  },
  { timestamps: true }
);

// Ley 1581 de 2012, art. 6: tratar un dato sensible exige autorizacion previa y
// explicita del titular (aqui, de su responsable legal). Sin esa autorizacion
// registrada, el perfil no puede guardar eps/rh/regimen_salud/alergias_condiciones.
studentProfileSchema.pre('validate', function exigirAutorizacionDatosSensibles(this: IStudentProfile, next) {
  if (tieneDatoSaludSensible(this) && !this.autorizacion_datos_sensibles?.otorgada) {
    return next(
      new Error(
        'Se requiere registrar la autorizacion explicita del acudiente/responsable legal ' +
          '(autorizacion_datos_sensibles.otorgada) para guardar datos sensibles de salud ' +
          '(eps, rh, regimen_salud o alergias_condiciones) — Ley 1581 de 2012, art. 6.'
      )
    );
  }
  next();
});

export const StudentProfile = model<IStudentProfile, StudentProfileModel>('StudentProfile', studentProfileSchema);
export default StudentProfile;
