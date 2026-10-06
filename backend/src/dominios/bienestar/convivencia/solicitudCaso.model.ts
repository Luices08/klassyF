import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  ESTADOS_SOLICITUD_CASO,
  EstadoSolicitudCaso,
  ROLES_INVOLUCRADO,
  RolInvolucrado,
  TIPOS_SITUACION,
  TipoSituacion,
} from '../comun/convivencia.constants';

export interface IInvolucradoSolicitud {
  student_id: Types.ObjectId;
  rol: RolInvolucrado;
  group_id: Types.ObjectId;
  enrollment_id: Types.ObjectId;
  /** Antecedente en el Observador: solo los presuntos responsables lo tienen. El resto vive únicamente en la solicitud y el caso. */
  observacion_id: Types.ObjectId | null;
}

/**
 * Lo que el docente envía a convivencia al registrar una falta Tipo II/III (o una Tipo I que decide remitir): hechos,
 * involucrados con su rol y acciones de contención. Es el traspaso de M14 a M15; el expediente formal lo abre
 * coordinación de convivencia. Solo convivencia la lee (nombres de otros menores, hechos sin tipificar).
 */
export interface ISolicitudCaso {
  sede_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  fecha_hecho: Date;
  gravedad: TipoSituacion;
  falta: { falta_id: Types.ObjectId; codigo: string; descripcion: string };
  hechos: string;
  acciones_contencion: string;
  involucrados: Types.DocumentArray<IInvolucradoSolicitud>;
  /** Un mismo hecho con varios presuntos responsables genera una sola solicitud y un antecedente por cada uno. */
  evento_id: Types.ObjectId | null;
  solicitada_por: Types.ObjectId;
  estado: EstadoSolicitudCaso;
  resolucion: { por: Types.ObjectId; fecha: Date; motivo: string } | null;
  /** Caso formal (M15) en que se convirtió. */
  caso_id: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SolicitudCasoDocument = HydratedDocument<ISolicitudCaso>;
type SolicitudCasoModel = Model<ISolicitudCaso>;

const involucradoSchema = new Schema<IInvolucradoSolicitud>({
  student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  rol: { type: String, enum: ROLES_INVOLUCRADO, required: true },
  group_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  enrollment_id: { type: Schema.Types.ObjectId, ref: 'Enrollment', required: true },
  observacion_id: { type: Schema.Types.ObjectId, ref: 'Observacion', default: null },
});

const solicitudCasoSchema = new Schema<ISolicitudCaso, SolicitudCasoModel>(
  {
    sede_id: { type: Schema.Types.ObjectId, ref: 'Campus', required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    fecha_hecho: { type: Date, required: true },
    gravedad: { type: String, enum: TIPOS_SITUACION, required: true },
    falta: {
      type: new Schema(
        {
          falta_id: { type: Schema.Types.ObjectId, ref: 'FaltaConvivencia', required: true },
          codigo: { type: String, required: true },
          descripcion: { type: String, required: true },
        },
        { _id: false }
      ),
      required: true,
    },
    hechos: { type: String, required: true, maxlength: 2000 },
    acciones_contencion: { type: String, default: '', maxlength: 1000 },
    involucrados: { type: [involucradoSchema], default: [] },
    evento_id: { type: Schema.Types.ObjectId, default: null },
    solicitada_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    estado: { type: String, enum: ESTADOS_SOLICITUD_CASO, default: 'PENDIENTE' },
    resolucion: {
      type: new Schema(
        {
          por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          fecha: { type: Date, required: true },
          motivo: { type: String, required: true, maxlength: 500 },
        },
        { _id: false }
      ),
      default: null,
    },
    caso_id: { type: Schema.Types.ObjectId, ref: 'CasoConvivencia', default: null },
  },
  { timestamps: true }
);

// Bandeja de coordinación de convivencia.
solicitudCasoSchema.index({ estado: 1, sede_id: 1, createdAt: -1 });

export const SolicitudCaso = model<ISolicitudCaso, SolicitudCasoModel>('SolicitudCaso', solicitudCasoSchema);
export default SolicitudCaso;
