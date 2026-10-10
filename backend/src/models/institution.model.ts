import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  TIPOS_FRANJA,
  TipoFranja,
  ESTADOS_USUARIO,
  EstadoUsuario,
  MODALIDADES_INSTITUCION,
  ModalidadInstitucion,
  POLITICAS_AFORO_AULA,
  PoliticaAforoAula,
} from '../constants/enums';

export interface ILimitesCargaDocente {
  PREESCOLAR: number;
  PRIMARIA: number;
  SECUNDARIA: number;
  MEDIA: number;
}

export interface ILimitesHorasPlanEstudios {
  PREESCOLAR: number;
  PRIMARIA: number;
  SECUNDARIA: number;
  MEDIA: number;
}

export interface IInstitution {
  nombre: string;
  codigo_dane: string;
  nit: string;
  resolucion_aprobacion: string;
  administrador_id: Types.ObjectId | null;
  /** Logo institucional como data URI (base64); se muestra en boletines/certificados. */
  logo_url: string | null;
  /** Contacto y atencion presencial (home publico, M04): correo de secretaria academica. */
  /** Ciudad y departamento del colegio: los usan los documentos oficiales («Dado en Bogotá D.C., …»). */
  ciudad: string | null;
  departamento: string | null;
  correo_secretaria: string | null;
  /** Horario de atencion en ventanilla (texto libre, ej. "Lunes a viernes 7:00 a 3:00 p.m."). */
  horario_atencion: string | null;
  /** Estructura de tiempo base (clases y descansos, por duracion) que se carga en cada jornada; M09 usa las franjas resultantes. */
  plantilla_franjas: Array<{ nombre: string; tipo: TipoFranja; duracion_min: number }>;
  /** VIRTUAL: sin espacios fisicos (M10 apagado, grupos sin aula). Los documentos anteriores a este campo son PRESENCIAL. */
  modalidad: ModalidadInstitucion;
  /** M10: que pasa si el cupo de un grupo excede el aforo de su aula (bloquear o solo advertir). */
  politica_aforo_aula: PoliticaAforoAula;
  /** M08: Topes maximos de carga horaria semanal por nivel segun Decreto 1850 / PEI institucional */
  limites_carga_docente?: ILimitesCargaDocente;
  /** M06: Tope maximo de horas semanales del Plan de Estudios por nivel (antes quemado en el frontend). */
  limites_horas_plan_estudios?: ILimitesHorasPlanEstudios;
  /** M08: cuántos grupos puede dirigir un mismo docente a la vez en un año lectivo (1 si no se configura). */
  max_direcciones_grupo_por_docente?: number;
  /** M08: holgura en horas bajo el tope antes de marcar subcarga a un docente (2 si no se configura). */
  tolerancia_subcarga_horas?: number;
  estado: EstadoUsuario;
  createdAt: Date;
  updatedAt: Date;
}

export type InstitutionDocument = HydratedDocument<IInstitution>;
type InstitutionModel = Model<IInstitution>;

const franjaPlantillaSchema = new Schema(
  {
    nombre: { type: String, required: true, trim: true },
    tipo: { type: String, enum: TIPOS_FRANJA, required: true },
    duracion_min: { type: Number, required: true, min: 5, max: 480 },
  },
  { _id: false }
);

const institutionSchema = new Schema<IInstitution, InstitutionModel>(
  {
    nombre: { type: String, required: true, trim: true },
    codigo_dane: {
      type: String,
      required: true,
      unique: true,
      match: [/^\d{12}$/, 'El codigo DANE debe tener exactamente 12 digitos numericos.'],
    },
    nit: { type: String, required: true, trim: true },
    resolucion_aprobacion: { type: String, required: true, trim: true },
    administrador_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    logo_url: { type: String, default: null },
    ciudad: { type: String, default: null, trim: true, maxlength: 80 },
    departamento: { type: String, default: null, trim: true, maxlength: 80 },
    correo_secretaria: { type: String, default: null, trim: true, lowercase: true },
    horario_atencion: { type: String, default: null, trim: true },
    plantilla_franjas: { type: [franjaPlantillaSchema], default: [] },
    modalidad: { type: String, enum: MODALIDADES_INSTITUCION, default: 'PRESENCIAL' },
    politica_aforo_aula: { type: String, enum: POLITICAS_AFORO_AULA, default: 'BLOQUEAR' },
    limites_carga_docente: {
      type: new Schema<ILimitesCargaDocente>(
        {
          PREESCOLAR: { type: Number, default: 20, min: 1, max: 40 },
          PRIMARIA: { type: Number, default: 25, min: 1, max: 40 },
          SECUNDARIA: { type: Number, default: 22, min: 1, max: 40 },
          MEDIA: { type: Number, default: 22, min: 1, max: 40 },
        },
        { _id: false }
      ),
      default: () => ({ PREESCOLAR: 20, PRIMARIA: 25, SECUNDARIA: 22, MEDIA: 22 }),
    },
    limites_horas_plan_estudios: {
      type: new Schema<ILimitesHorasPlanEstudios>(
        {
          PREESCOLAR: { type: Number, default: 30, min: 1, max: 50 },
          PRIMARIA: { type: Number, default: 30, min: 1, max: 50 },
          SECUNDARIA: { type: Number, default: 30, min: 1, max: 50 },
          MEDIA: { type: Number, default: 30, min: 1, max: 50 },
        },
        { _id: false }
      ),
      default: () => ({ PREESCOLAR: 30, PRIMARIA: 30, SECUNDARIA: 30, MEDIA: 30 }),
    },
    max_direcciones_grupo_por_docente: { type: Number, default: 1, min: 1, max: 10 },
    tolerancia_subcarga_horas: { type: Number, default: 2, min: 0, max: 10 },
    estado: { type: String, enum: ESTADOS_USUARIO, default: 'activo' },
  },
  { timestamps: true }
);

export const Institution = model<IInstitution, InstitutionModel>('Institution', institutionSchema);
export default Institution;
