import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { VERIFICACIONES_SERVICIO_SOCIAL, VerificacionServicioSocial } from '../constants/titulacion';

/** Una tanda de horas de servicio social estudiantil obligatorio (Res. 4210/1996) certificada por la entidad donde se prestó. Secretaría la registra (M26). */
export interface IRegistroServicioSocial {
  student_id: Types.ObjectId;
  horas: number;
  entidad: string;
  descripcion: string;
  fecha_inicio: Date | null;
  fecha_fin: Date | null;
  registrado_por: Types.ObjectId;
  /** Una tanda mal registrada no se borra: se anula con motivo y deja de sumar. */
  estado: 'VIGENTE' | 'ANULADO';
  anulacion: { motivo: string; por: Types.ObjectId; fecha: Date } | null;
  /** El certificado de la entidad (PDF o imagen). Los registros anteriores al soporte no lo tienen. */
  soporte: { nombre: string; archivo_path: string; mimetype: string; tamano: number } | null;
  verificacion: VerificacionServicioSocial;
  verificado: { por: Types.ObjectId; fecha: Date; motivo: string } | null;
  createdAt: Date;
}
export type RegistroServicioSocialDocument = HydratedDocument<IRegistroServicioSocial>;

const servicioSocialSchema = new Schema<IRegistroServicioSocial, Model<IRegistroServicioSocial>>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    horas: { type: Number, required: true, min: 0.5, max: 2000 },
    entidad: { type: String, required: true, trim: true, maxlength: 160 },
    descripcion: { type: String, trim: true, maxlength: 500, default: '' },
    fecha_inicio: { type: Date, default: null },
    fecha_fin: { type: Date, default: null },
    registrado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    estado: { type: String, enum: ['VIGENTE', 'ANULADO'], default: 'VIGENTE' },
    anulacion: {
      type: new Schema({ motivo: { type: String, required: true }, por: { type: Schema.Types.ObjectId, ref: 'User', required: true }, fecha: { type: Date, required: true } }, { _id: false }),
      default: null,
    },
    soporte: {
      type: new Schema({ nombre: { type: String, required: true }, archivo_path: { type: String, required: true }, mimetype: { type: String, required: true }, tamano: { type: Number, required: true } }, { _id: false }),
      default: null,
    },
    // El valor de partida es HEREDADO a propósito: lo leen así los documentos que se guardaron antes de que existiera el soporte. Todo registro nuevo lo fija en PENDIENTE al crearse.
    verificacion: { type: String, enum: VERIFICACIONES_SERVICIO_SOCIAL, default: 'HEREDADO' },
    verificado: {
      type: new Schema({ por: { type: Schema.Types.ObjectId, ref: 'User', required: true }, fecha: { type: Date, required: true }, motivo: { type: String, default: '' } }, { _id: false }),
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
export const RegistroServicioSocial = model<IRegistroServicioSocial>('RegistroServicioSocial', servicioSocialSchema);

/** La presentación de las pruebas Saber 11 (Ley 1324/2009): solo el código de registro y la fecha; nunca los puntajes. Una por estudiante. */
export interface IRegistroSaber11 {
  student_id: Types.ObjectId;
  codigo_registro: string;
  fecha_presentacion: Date | null;
  registrado_por: Types.ObjectId;
  updatedAt: Date;
}
const saber11Schema = new Schema<IRegistroSaber11, Model<IRegistroSaber11>>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    codigo_registro: { type: String, required: true, trim: true, maxlength: 40 },
    fecha_presentacion: { type: Date, default: null },
    registrado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);
export const RegistroSaber11 = model<IRegistroSaber11>('RegistroSaber11', saber11Schema);

/**
 * Certificado de un grado cursado en OTRO colegio, recibido por Secretaría para completar la carpeta académica. Los grados cursados aquí
 * no se registran: cuentan solos por el cierre de promoción (M19). Sin la carpeta completa no se expide el diploma.
 */
export interface ICertificadoGradoExterno {
  student_id: Types.ObjectId;
  grado_numero: number;
  institucion_origen: string;
  anio: number | null;
  registrado_por: Types.ObjectId;
  createdAt: Date;
}
const certificadoExternoSchema = new Schema<ICertificadoGradoExterno, Model<ICertificadoGradoExterno>>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    grado_numero: { type: Number, required: true, min: -2, max: 11 },
    institucion_origen: { type: String, required: true, trim: true, maxlength: 160 },
    anio: { type: Number, min: 1900, max: 2200, default: null },
    registrado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
certificadoExternoSchema.index({ student_id: 1, grado_numero: 1 }, { unique: true });
export const CertificadoGradoExterno = model<ICertificadoGradoExterno>('CertificadoGradoExterno', certificadoExternoSchema);
