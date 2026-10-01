import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';

// Catalogo minimo de eventos de M02 (cuentas y seguridad). Se amplia cuando
// otro modulo (M31 completo) necesite registrar los suyos.
export const ACCIONES_AUDITORIA = [
  'LOGIN_EXITOSO',
  'LOGIN_FALLIDO',
  'USUARIO_CREADO',
  'USUARIO_ACTUALIZADO',
  'USUARIO_ESTADO_CAMBIADO',
  'USUARIO_ELIMINADO',
  'USUARIO_ELIMINACION_BLOQUEADA',
  'PASSWORD_RESETEADA',
  'PASSWORD_CAMBIADA',
  'SESIONES_CERRADAS',
  'USUARIOS_IMPORTADOS',
  // M04: Admisiones y matriculas
  'MATRICULA_CREADA',
  'MATRICULA_ESTADO_CAMBIADO',
  'MATRICULA_GRUPO_CAMBIADO',
  'MATRICULA_SOBRECUPO_AUTORIZADO',
  'DOCUMENTO_CARGADO',
  'DOCUMENTO_REVISADO',
  // M05: Año lectivo, periodos y calendario
  'ANIO_LECTIVO_CREADO',
  'ANIO_LECTIVO_ACTUALIZADO',
  'ANIO_LECTIVO_ACTIVADO',
  'ANIO_LECTIVO_CERRADO',
  'PERIODO_ESTADO_CAMBIADO',
  'PRORROGA_OTORGADA',
  'PRORROGA_REVOCADA',
  'CALENDARIO_ACTUALIZADO',
  'ESCALA_EVALUACION_ACTUALIZADA',
  'PONDERACION_COMPONENTES_ACTUALIZADA',
  // M10: Espacios fisicos
  'ESPACIO_CREADO',
  'ESPACIO_ACTUALIZADO',
  'ESPACIO_ESTADO_CAMBIADO',
  'ESPACIO_ELIMINADO',
  'GRUPO_EXCEDE_AFORO_AULA',
  // M01/M05: estructura de tiempo de las jornadas
  'JORNADA_HORARIO_ACTUALIZADO',
  'PLANTILLA_FRANJAS_ACTUALIZADA',
] as const;
export type AccionAuditoria = (typeof ACCIONES_AUDITORIA)[number];

export interface IAuditLog {
  usuario_id: Types.ObjectId | null;
  accion: AccionAuditoria;
  entidad: string;
  entidad_id: Types.ObjectId | null;
  detalle: string | null;
  ip: string | null;
  createdAt: Date;
}

export type AuditLogDocument = HydratedDocument<IAuditLog>;
type AuditLogModel = Model<IAuditLog>;

const auditLogSchema = new Schema<IAuditLog, AuditLogModel>(
  {
    usuario_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    accion: { type: String, enum: ACCIONES_AUDITORIA, required: true },
    entidad: { type: String, required: true },
    entidad_id: { type: Schema.Types.ObjectId, default: null },
    detalle: { type: String, default: null },
    ip: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ usuario_id: 1, createdAt: -1 });
auditLogSchema.index({ accion: 1, createdAt: -1 });

export const AuditLog = model<IAuditLog, AuditLogModel>('AuditLog', auditLogSchema);
export default AuditLog;
