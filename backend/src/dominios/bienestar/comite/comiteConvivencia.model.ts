import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  ESTADOS_SESION_COMITE,
  EstadoSesionComite,
  TIPOS_SESION_COMITE,
  TipoSesionComite,
} from '../comun/convivencia.constants';
import { ESTADOS_USUARIO, EstadoUsuario } from '../../../constants/enums';

/**
 * Integrante del comité de un año lectivo (M15). Puede ser un usuario del sistema o una designación externa (personero
 * estudiantil, representante de los padres): las designaciones no son roles de sistema.
 */
export interface IMiembroComite {
  academic_year_id: Types.ObjectId;
  cargo: string;
  nombre: string;
  usuario_id: Types.ObjectId | null;
  documento: string;
  es_presidente: boolean;
  estado: EstadoUsuario;
  createdAt: Date;
  updatedAt: Date;
}
export type MiembroComiteDocument = HydratedDocument<IMiembroComite>;

const miembroSchema = new Schema<IMiembroComite, Model<IMiembroComite>>(
  {
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    cargo: { type: String, required: true, trim: true, maxlength: 80 },
    nombre: { type: String, required: true, trim: true, maxlength: 120 },
    usuario_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    documento: { type: String, default: '', trim: true, maxlength: 30 },
    es_presidente: { type: Boolean, default: false },
    estado: { type: String, enum: ESTADOS_USUARIO, default: 'activo' },
  },
  { timestamps: true }
);
miembroSchema.index({ academic_year_id: 1, estado: 1 });
miembroSchema.index({ academic_year_id: 1, usuario_id: 1 }, { unique: true, partialFilterExpression: { usuario_id: { $type: 'objectId' } } });
export const MiembroComite = model<IMiembroComite>('MiembroComite', miembroSchema);

export interface IAsistenteSesion {
  miembro_id: Types.ObjectId;
  /** Nombre y cargo copiados al crear la sesión: el acta no cambia si luego se edita el miembro. */
  nombre: string;
  cargo: string;
  es_presidente: boolean;
  asistio: boolean;
}

export interface ICasoTratado {
  caso_id: Types.ObjectId;
  codigo: string;
  /** Lo decidido sobre el caso. En el acta el caso se identifica solo por su código. */
  decisiones: string;
  /** Miembros apartados de la deliberación de este caso (implicados o con conflicto de interés). */
  recusados_ids: Types.ObjectId[];
}

export interface IAnexoActa {
  fecha: Date;
  por: Types.ObjectId;
  texto: string;
}

export interface ISesionComite {
  academic_year_id: Types.ObjectId;
  anio: number;
  tipo: TipoSesionComite;
  fecha: Date;
  hora: string;
  lugar: string;
  orden_del_dia: string;
  desarrollo: string;
  asistentes: Types.DocumentArray<IAsistenteSesion>;
  casos_tratados: Types.DocumentArray<ICasoTratado>;
  quorum: { total_miembros: number; presentes: number; porcentaje_requerido: number; alcanzado: boolean };
  estado: EstadoSesionComite;
  /** Se asigna al firmar (consecutivo anual sin huecos): un borrador que se anula no deja un hueco. */
  consecutivo: number | null;
  codigo: string | null;
  firma: { por: Types.ObjectId; fecha: Date; hash: string } | null;
  /** Correcciones posteriores a la firma: el acta firmada no se edita, se le anexa. */
  anexos: Types.DocumentArray<IAnexoActa>;
  anulacion: { motivo: string; por: Types.ObjectId; fecha: Date } | null;
  creado_por: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
export type SesionComiteDocument = HydratedDocument<ISesionComite>;

const asistenteSchema = new Schema<IAsistenteSesion>({
  miembro_id: { type: Schema.Types.ObjectId, ref: 'MiembroComite', required: true },
  nombre: { type: String, required: true },
  cargo: { type: String, required: true },
  es_presidente: { type: Boolean, default: false },
  asistio: { type: Boolean, default: false },
});

const casoTratadoSchema = new Schema<ICasoTratado>({
  caso_id: { type: Schema.Types.ObjectId, ref: 'CasoConvivencia', required: true },
  codigo: { type: String, required: true },
  decisiones: { type: String, default: '', maxlength: 3000 },
  recusados_ids: { type: [{ type: Schema.Types.ObjectId, ref: 'MiembroComite' }], default: [] },
});

const anexoSchema = new Schema<IAnexoActa>({
  fecha: { type: Date, required: true },
  por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  texto: { type: String, required: true, maxlength: 3000 },
});

const sesionSchema = new Schema<ISesionComite, Model<ISesionComite>>(
  {
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    anio: { type: Number, required: true },
    tipo: { type: String, enum: TIPOS_SESION_COMITE, required: true },
    fecha: { type: Date, required: true },
    hora: { type: String, default: '', maxlength: 5 },
    lugar: { type: String, default: '', trim: true, maxlength: 200 },
    orden_del_dia: { type: String, default: '', maxlength: 3000 },
    desarrollo: { type: String, default: '', maxlength: 8000 },
    asistentes: { type: [asistenteSchema], default: [] },
    casos_tratados: { type: [casoTratadoSchema], default: [] },
    quorum: {
      type: new Schema(
        {
          total_miembros: { type: Number, default: 0 },
          presentes: { type: Number, default: 0 },
          porcentaje_requerido: { type: Number, default: 0 },
          alcanzado: { type: Boolean, default: false },
        },
        { _id: false }
      ),
      default: () => ({ total_miembros: 0, presentes: 0, porcentaje_requerido: 0, alcanzado: false }),
    },
    estado: { type: String, enum: ESTADOS_SESION_COMITE, default: 'BORRADOR' },
    consecutivo: { type: Number, default: null },
    codigo: { type: String, default: null },
    firma: {
      type: new Schema(
        {
          por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          fecha: { type: Date, required: true },
          hash: { type: String, required: true },
        },
        { _id: false }
      ),
      default: null,
    },
    anexos: { type: [anexoSchema], default: [] },
    anulacion: {
      type: new Schema(
        {
          motivo: { type: String, required: true },
          por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          fecha: { type: Date, required: true },
        },
        { _id: false }
      ),
      default: null,
    },
    creado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Un acta firmada es inmutable: solo admite anexos. Se garantiza aquí, no solo en el servicio, para que ninguna ruta futura la edite.
sesionSchema.pre('save', function protegerActaFirmada(next) {
  if (this.estado === 'FIRMADA' && !this.isNew && !this.isModified('estado')) {
    const tocados = this.modifiedPaths().filter((ruta) => ruta !== 'updatedAt' && !ruta.startsWith('anexos'));
    if (tocados.length > 0) return next(new Error('Un acta firmada no se puede modificar: agrega un anexo.'));
  }
  next();
});

sesionSchema.index({ anio: 1, fecha: -1 });
sesionSchema.index({ anio: 1, consecutivo: 1 }, { unique: true, partialFilterExpression: { consecutivo: { $type: 'number' } } });
export const SesionComite = model<ISesionComite>('SesionComite', sesionSchema);
