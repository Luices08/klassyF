import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  ESTADOS_CASO,
  ESTADOS_PASO_PROTOCOLO,
  EstadoCaso,
  EstadoPasoProtocolo,
  MEDIOS_CITACION,
  MedioCitacion,
  ORIGENES_CASO,
  OrigenCaso,
  PARTES_DESCARGO,
  ParteDescargo,
  RESULTADOS_CIERRE_CASO,
  ROLES_INVOLUCRADO,
  ResultadoCierreCaso,
  RolInvolucrado,
  TIPOS_NOTIFICACION_CASO,
  TIPOS_SITUACION,
  TipoNotificacionCaso,
  TipoSituacion,
} from '../constants/convivencia';

/** Falta del manual en que se funda una decisión, copiada al decidir. */
export interface IFaltaDecision {
  falta_id: Types.ObjectId;
  codigo: string;
  descripcion: string;
  gravedad: TipoSituacion;
}

export interface IInvolucradoCaso {
  student_id: Types.ObjectId;
  rol: RolInvolucrado;
  /** Grupo y matrícula del estudiante al abrir el caso (contexto, no se actualiza). */
  group_id: Types.ObjectId;
  enrollment_id: Types.ObjectId;
}

export interface IPasoCaso {
  nombre: string;
  obligatorio: boolean;
  orden: number;
  estado: EstadoPasoProtocolo;
  fecha: Date | null;
  por: Types.ObjectId | null;
  nota: string;
}

export interface IAtencionInmediata {
  descripcion: string;
  hubo_dano: boolean;
  fecha: Date;
  por: Types.ObjectId;
}

export interface ISeguimientoCaso {
  fecha: Date;
  nota: string;
  proxima_fecha: Date | null;
  por: Types.ObjectId;
}

export interface INotificacionCaso {
  tipo: TipoNotificacionCaso;
  fecha: Date;
  medio: MedioCitacion;
  dirigida_a: string;
  resultado: string;
  por: Types.ObjectId;
}

export interface IDescargoCaso {
  parte: ParteDescargo;
  student_id: Types.ObjectId | null;
  fecha: Date;
  texto: string;
  por: Types.ObjectId;
}

export interface IMedidaProteccionCaso {
  descripcion: string;
  fecha: Date;
  por: Types.ObjectId;
}

export interface IRemisionCaso {
  entidad_id: Types.ObjectId;
  entidad_nombre: string;
  fecha: Date;
  oficio: string;
  funcionario: string;
  respuesta: string;
  por: Types.ObjectId;
}

export interface IMedidaAplicadaCaso {
  medida_id: Types.ObjectId;
  nombre: string;
  dias: number | null;
  observaciones: string;
  fecha: Date;
  por: Types.ObjectId;
}

export interface IDecisionCaso {
  motivacion: string;
  fecha: Date;
  por: Types.ObjectId;
  faltas: IFaltaDecision[];
}

export interface IReclasificacionCaso {
  de: TipoSituacion;
  a: TipoSituacion;
  motivo: string;
  por: Types.ObjectId;
  fecha: Date;
}

export interface IAccionConMotivo {
  motivo: string;
  por: Types.ObjectId;
  fecha: Date;
}

export interface ICasoConvivencia {
  /** Consecutivo anual sin huecos (contador atómico en la transacción de apertura), p. ej. CC-2026-0007. */
  codigo: string;
  consecutivo: number;
  academic_year_id: Types.ObjectId;
  anio: number;
  sede_id: Types.ObjectId;
  tipo_situacion: TipoSituacion;
  estado: EstadoCaso;
  origen: OrigenCaso;
  /** Solicitud (M14) de la que nació; null en una apertura directa. */
  solicitud_id: Types.ObjectId | null;
  /** Antecedentes en el Observador de los presuntos responsables (para mostrar al director que existe un caso). */
  observacion_ids: Types.ObjectId[];
  fecha_hecho: Date;
  lugar: string;
  hechos: string;
  como_se_conocio: string;
  /** Las acciones inmediatas de contención que reportó el docente al enviar la solicitud. */
  contencion_reportada: string;
  involucrados: Types.DocumentArray<IInvolucradoCaso>;
  atencion_inmediata: IAtencionInmediata | null;
  medidas_proteccion: Types.DocumentArray<IMedidaProteccionCaso>;
  pasos: Types.DocumentArray<IPasoCaso>;
  notificaciones: Types.DocumentArray<INotificacionCaso>;
  descargos: Types.DocumentArray<IDescargoCaso>;
  seguimientos: Types.DocumentArray<ISeguimientoCaso>;
  remisiones: Types.DocumentArray<IRemisionCaso>;
  /** Por qué un caso tipo III no tuvo remisión (queda por escrito para poder cerrarlo). */
  justificacion_sin_remision: string;
  decision: IDecisionCaso | null;
  medidas_aplicadas: Types.DocumentArray<IMedidaAplicadaCaso>;
  reclasificaciones: IReclasificacionCaso[];
  resultado_cierre: ResultadoCierreCaso | null;
  cierre: IAccionConMotivo | null;
  reaperturas: IAccionConMotivo[];
  anulacion: IAccionConMotivo | null;
  /** Quienes se declararon impedidos o fueron apartados por conflicto de interés (RN-15-11): no ven ni gestionan el caso. */
  impedidos: { usuario_id: Types.ObjectId; motivo: string; por: Types.ObjectId; fecha: Date }[];
  creado_por: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type CasoConvivenciaDocument = HydratedDocument<ICasoConvivencia>;
type CasoConvivenciaModel = Model<ICasoConvivencia>;

const accionConMotivoSchema = new Schema<IAccionConMotivo>(
  {
    motivo: { type: String, required: true, maxlength: 1000 },
    por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fecha: { type: Date, required: true },
  },
  { _id: false }
);

const involucradoSchema = new Schema<IInvolucradoCaso>({
  student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  rol: { type: String, enum: ROLES_INVOLUCRADO, required: true },
  group_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  enrollment_id: { type: Schema.Types.ObjectId, ref: 'Enrollment', required: true },
});

const pasoSchema = new Schema<IPasoCaso>({
  nombre: { type: String, required: true, trim: true, maxlength: 200 },
  obligatorio: { type: Boolean, default: false },
  orden: { type: Number, default: 0 },
  estado: { type: String, enum: ESTADOS_PASO_PROTOCOLO, default: 'PENDIENTE' },
  fecha: { type: Date, default: null },
  por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  nota: { type: String, default: '', maxlength: 1000 },
});

const atencionSchema = new Schema<IAtencionInmediata>(
  {
    descripcion: { type: String, required: true, maxlength: 2000 },
    hubo_dano: { type: Boolean, default: false },
    fecha: { type: Date, required: true },
    por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false }
);

const seguimientoSchema = new Schema<ISeguimientoCaso>({
  fecha: { type: Date, required: true },
  nota: { type: String, required: true, maxlength: 2000 },
  proxima_fecha: { type: Date, default: null },
  por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

const notificacionSchema = new Schema<INotificacionCaso>({
  tipo: { type: String, enum: TIPOS_NOTIFICACION_CASO, required: true },
  fecha: { type: Date, required: true },
  medio: { type: String, enum: MEDIOS_CITACION, required: true },
  dirigida_a: { type: String, default: '', maxlength: 120 },
  resultado: { type: String, default: '', maxlength: 500 },
  por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

const descargoSchema = new Schema<IDescargoCaso>({
  parte: { type: String, enum: PARTES_DESCARGO, required: true },
  student_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  fecha: { type: Date, required: true },
  texto: { type: String, required: true, maxlength: 3000 },
  por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

const medidaProteccionSchema = new Schema<IMedidaProteccionCaso>({
  descripcion: { type: String, required: true, maxlength: 1000 },
  fecha: { type: Date, required: true },
  por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

const remisionSchema = new Schema<IRemisionCaso>({
  entidad_id: { type: Schema.Types.ObjectId, ref: 'EntidadExterna', required: true },
  entidad_nombre: { type: String, required: true },
  fecha: { type: Date, required: true },
  oficio: { type: String, default: '', maxlength: 120 },
  funcionario: { type: String, default: '', maxlength: 120 },
  respuesta: { type: String, default: '', maxlength: 1000 },
  por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

const medidaAplicadaSchema = new Schema<IMedidaAplicadaCaso>({
  medida_id: { type: Schema.Types.ObjectId, ref: 'MedidaConvivencia', required: true },
  nombre: { type: String, required: true },
  dias: { type: Number, default: null, min: 0 },
  observaciones: { type: String, default: '', maxlength: 1000 },
  fecha: { type: Date, required: true },
  por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

const decisionSchema = new Schema<IDecisionCaso>(
  {
    motivacion: { type: String, required: true, maxlength: 4000 },
    fecha: { type: Date, required: true },
    por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    faltas: {
      type: [
        new Schema<IFaltaDecision>(
          {
            falta_id: { type: Schema.Types.ObjectId, ref: 'FaltaConvivencia', required: true },
            codigo: { type: String, required: true },
            descripcion: { type: String, required: true },
            gravedad: { type: String, enum: TIPOS_SITUACION, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { _id: false }
);

const casoSchema = new Schema<ICasoConvivencia, CasoConvivenciaModel>(
  {
    codigo: { type: String, required: true, unique: true },
    consecutivo: { type: Number, required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    anio: { type: Number, required: true },
    sede_id: { type: Schema.Types.ObjectId, ref: 'Campus', required: true },
    tipo_situacion: { type: String, enum: TIPOS_SITUACION, required: true },
    estado: { type: String, enum: ESTADOS_CASO, default: 'ABIERTO' },
    origen: { type: String, enum: ORIGENES_CASO, required: true },
    solicitud_id: { type: Schema.Types.ObjectId, ref: 'SolicitudCaso', default: null },
    observacion_ids: { type: [{ type: Schema.Types.ObjectId, ref: 'Observacion' }], default: [] },
    fecha_hecho: { type: Date, required: true },
    lugar: { type: String, default: '', trim: true, maxlength: 200 },
    hechos: { type: String, required: true, trim: true, maxlength: 4000 },
    como_se_conocio: { type: String, default: '', trim: true, maxlength: 300 },
    contencion_reportada: { type: String, default: '', maxlength: 1000 },
    involucrados: { type: [involucradoSchema], default: [] },
    atencion_inmediata: { type: atencionSchema, default: null },
    medidas_proteccion: { type: [medidaProteccionSchema], default: [] },
    pasos: { type: [pasoSchema], default: [] },
    notificaciones: { type: [notificacionSchema], default: [] },
    descargos: { type: [descargoSchema], default: [] },
    seguimientos: { type: [seguimientoSchema], default: [] },
    remisiones: { type: [remisionSchema], default: [] },
    justificacion_sin_remision: { type: String, default: '', maxlength: 1000 },
    decision: { type: decisionSchema, default: null },
    medidas_aplicadas: { type: [medidaAplicadaSchema], default: [] },
    reclasificaciones: {
      type: [
        new Schema<IReclasificacionCaso>(
          {
            de: { type: String, enum: TIPOS_SITUACION, required: true },
            a: { type: String, enum: TIPOS_SITUACION, required: true },
            motivo: { type: String, required: true, maxlength: 1000 },
            por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            fecha: { type: Date, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    resultado_cierre: { type: String, enum: [...RESULTADOS_CIERRE_CASO, null], default: null },
    cierre: { type: accionConMotivoSchema, default: null },
    reaperturas: { type: [accionConMotivoSchema], default: [] },
    anulacion: { type: accionConMotivoSchema, default: null },
    impedidos: {
      type: [
        new Schema(
          {
            usuario_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            motivo: { type: String, required: true, maxlength: 500 },
            por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            fecha: { type: Date, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    creado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

casoSchema.index({ anio: 1, consecutivo: 1 }, { unique: true });
casoSchema.index({ sede_id: 1, estado: 1, tipo_situacion: 1 });
casoSchema.index({ 'involucrados.student_id': 1 });
casoSchema.index({ observacion_ids: 1 });

export const CasoConvivencia = model<ICasoConvivencia, CasoConvivenciaModel>('CasoConvivencia', casoSchema);
export default CasoConvivencia;
