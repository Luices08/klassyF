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
import { GRUPOS_SISBEN } from '../constants/sisben';
import { tieneDatoSaludSensible } from '../utils/datosSensibles';

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

/** Marca de los estudiantes que llegaron por la importación desde SIMAT: sus datos y su acudiente quedan por revisar hasta que alguien lo confirme. */
export interface IOrigenSimat {
  lote_id: Types.ObjectId;
  fecha: Date;
  revision: 'PENDIENTE' | 'REVISADA';
  revisada_por: Types.ObjectId | null;
  fecha_revision: Date | null;
}

export interface IStudentProfile {
  user_id: Types.ObjectId;
  // Identificacion
  /** El nombre desglosado que exige SIMAT: «nombre» y «apellido» del usuario siguen siendo lo que se muestra. Opcionales: nunca se parten a la fuerza. */
  primer_nombre?: string;
  segundo_nombre?: string;
  primer_apellido?: string;
  segundo_apellido?: string;
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
  /** Grupo del SISBEN IV (A1…D21). Vacío = no está en el SISBEN. */
  sisben_grupo?: string | null;
  pais_origen?: string;
  pais_nacimiento?: string;
  nacionalidad_2?: string;
  /** Correo que el colegio tiene de contacto de la familia (SIMAT). No es el del usuario: ese es único y los hermanos comparten el de la familia. */
  correo_contacto?: string;
  // Poblacion y vulnerabilidad
  grupo_etnico: GrupoEtnico;
  /** El valor de SIMAT tal cual (pueblo indígena, «Negritudes»): `grupo_etnico` solo guarda la categoría general. */
  etnia_detalle?: string;
  victima_conflicto: boolean;
  tiene_discapacidad: boolean;
  tiene_talento_excepcional: boolean;
  /** Notas de inclusion para el futuro M16 (PIAR); no es el PIAR en si. */
  descripcion_inclusion?: string;
  // Trayectoria
  institucion_procedencia?: string;
  estado: EstadoEstudiante;
  autorizacion_datos_sensibles: IAutorizacionDatosSensibles;
  /** Identificadores estables de la persona en SIMAT: sobreviven a un cambio de tipo o número de documento. */
  simat_per_id?: string;
  simat_nui?: string;
  /** null = no vino de la importación SIMAT. */
  origen_simat?: IOrigenSimat | null;
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

const origenSimatSchema = new Schema<IOrigenSimat>(
  {
    lote_id: { type: Schema.Types.ObjectId, ref: 'ImportacionSimat', required: true },
    fecha: { type: Date, required: true },
    revision: { type: String, enum: ['PENDIENTE', 'REVISADA'], default: 'PENDIENTE' },
    revisada_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    fecha_revision: { type: Date, default: null },
  },
  { _id: false }
);

const studentProfileSchema = new Schema<IStudentProfile, StudentProfileModel>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    primer_nombre: { type: String, trim: true, maxlength: 60 },
    segundo_nombre: { type: String, trim: true, maxlength: 60 },
    primer_apellido: { type: String, trim: true, maxlength: 60 },
    segundo_apellido: { type: String, trim: true, maxlength: 60 },
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
    sisben_grupo: { type: String, enum: [...GRUPOS_SISBEN, null], default: null },
    pais_origen: { type: String, trim: true, maxlength: 80 },
    pais_nacimiento: { type: String, trim: true, maxlength: 80 },
    nacionalidad_2: { type: String, trim: true, maxlength: 80 },
    correo_contacto: { type: String, trim: true, lowercase: true, maxlength: 120 },
    grupo_etnico: { type: String, enum: GRUPOS_ETNICOS, default: 'NINGUNO' },
    etnia_detalle: { type: String, trim: true, maxlength: 120 },
    victima_conflicto: { type: Boolean, default: false },
    tiene_discapacidad: { type: Boolean, default: false },
    tiene_talento_excepcional: { type: Boolean, default: false },
    descripcion_inclusion: { type: String, trim: true },
    institucion_procedencia: { type: String, trim: true },
    estado: { type: String, enum: ESTADOS_ESTUDIANTE, default: 'ACTIVO' },
    autorizacion_datos_sensibles: { type: autorizacionDatosSensiblesSchema, default: () => ({}) },
    simat_per_id: { type: String, trim: true, maxlength: 20 },
    simat_nui: { type: String, trim: true, maxlength: 30 },
    origen_simat: { type: origenSimatSchema, default: null },
  },
  { timestamps: true }
);

// Cruce estable con SIMAT (no único: dos registros de SIMAT nunca deben tumbar una importación; el servicio decide).
studentProfileSchema.index({ simat_per_id: 1 }, { sparse: true });
studentProfileSchema.index({ 'origen_simat.revision': 1 }, { sparse: true });

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
