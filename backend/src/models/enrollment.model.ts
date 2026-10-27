import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  ESTADOS_DOCUMENTO_MATRICULA,
  ESTADOS_MATRICULA_CON_FOLIO,
  ESTADOS_MATRICULA_VIVOS,
  ESTADOS_MATRICULA,
  EstadoDocumentoMatricula,
  EstadoMatricula,
  TIPOS_INGRESO,
  TipoDocumentoMatricula,
  TipoIngreso,
} from '../constants/enums';
import { TIPOS_SALIDA, TipoSalida } from '../constants/salidas';

export interface IChecklistItem {
  tipo_documento: TipoDocumentoMatricula;
  nombre_personalizado?: string | null;
  /** Copia de lo que decía el catálogo al agregar el documento (null en los anteriores: se lee de las constantes de partida). */
  indicacion?: string | null;
  categoria?: string | null;
  obligatorio?: boolean;
  estado: EstadoDocumentoMatricula;
  archivo_path: string | null;
  comentario: string | null;
  fecha_carga: Date | null;
  revisado_por: Types.ObjectId | null;
  /** Quién subió el archivo: la familia (sitio público o portal) o el personal. null en los anteriores. */
  cargado_por_tipo?: 'FAMILIA' | 'PERSONAL' | null;
  cargado_por?: Types.ObjectId | null;
  /**
   * Cuándo secretaría tuvo el original en la mano y lo dio por bueno, sin que haya archivo todavía (quién: `revisado_por`). El documento queda APROBADO
   * y sin archivo; el archivo se sube después y no pasa de nuevo por revisión. null = nunca se verificó así.
   */
  fecha_verificacion_fisica?: Date | null;
}

/** Soporte documental de la salida (carta de retiro, constancia de la institución receptora...). Mientras no exista el archivo general (M29) vive en disco. */
export interface ISoporteSalida {
  _id: Types.ObjectId;
  nombre: string;
  archivo_path: string;
  mimetype: string;
  tamano: number;
  cargado_por: Types.ObjectId;
  fecha: Date;
}

/**
 * Cómo y cuándo terminó la matrícula (retiro o traslado). Es un asiento histórico: una vez registrada no se edita (solo se agregan soportes y se
 * libera el cupo); un dato mal registrado se aclara en la auditoría, no se reescribe.
 */
export interface ISalidaMatricula {
  tipo: TipoSalida;
  /** Desde este día el estudiante ya no es del aula: lo anterior (notas, asistencia) se conserva y lo posterior no se cuenta. */
  fecha_efectiva: Date;
  motivo: string;
  observaciones: string;
  institucion_receptora: { nombre: string; codigo_dane: string; municipio: string } | null;
  estado_previo: EstadoMatricula;
  registrado_por: Types.ObjectId;
  fecha_registro: Date;
  cupo_liberado: boolean;
  fecha_cupo_liberado: Date | null;
  soportes: Types.DocumentArray<ISoporteSalida>;
}

/** Un tramo del paso del estudiante por un grupo en el año: sirve para saber en qué grupo estaba cualquier día, aunque después cambie o se retire. */
export interface ITramoTrayectoria {
  group_id: Types.ObjectId;
  desde: Date;
  /** null mientras sigue en ese grupo. */
  hasta: Date | null;
}

export interface IEnrollment {
  student_id: Types.ObjectId;
  group_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  /** null mientras esta PREINSCRITO: el folio se asigna al formalizar la matricula (ver enrollment.service). */
  folio_matricula: string | null;
  numero_libro: number | null;
  numero_folio: number | null;
  tipo_ingreso: TipoIngreso;
  estado: EstadoMatricula;
  fecha_matricula: Date;
  /** Plazo del acta de compromiso mientras la matricula esta MATRICULADO_CONDICIONAL. */
  fecha_limite_compromiso: Date | null;
  /** Plazo para entregar documentos y legalizar el cupo mientras la matricula esta PREINSCRITO. */
  fecha_limite_legalizacion: Date | null;
  motivo_retiro: string | null;
  /** `Grade.numero` del último grado que el estudiante aprobó según el certificado que presentó; solo lo declara secretaría a quien no tiene historial en el sistema. */
  ultimo_grado_aprobado: number | null;
  /** null mientras la matrícula sigue; las anteriores a este campo que estén RETIRADO tampoco la tienen. */
  salida: ISalidaMatricula | null;
  trayectoria: Types.DocumentArray<ITramoTrayectoria>;
  checklist: Types.DocumentArray<IChecklistItem>;
  /** Novedades institucionales que el sistema asienta solo (p. ej. promoción anticipada), con la referencia que las respalda. */
  novedades: Array<{ tipo: string; texto: string; referencia: string; fecha: Date; por: Types.ObjectId }>;
  /** De dónde salió el asiento: null = lo registró una persona en Klassy; `IMPORTACION_SIMAT` = lo creó o confirmó la carga desde SIMAT (se distingue en las listas). */
  origen: 'IMPORTACION_SIMAT' | null;
  importacion_simat_id: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type EnrollmentDocument = HydratedDocument<IEnrollment>;
type EnrollmentModel = Model<IEnrollment>;

const checklistItemSchema = new Schema<IChecklistItem>(
  {
    tipo_documento: { type: String, trim: true, match: /^[A-Z0-9_]{2,60}$/, required: true },
    nombre_personalizado: { type: String, default: null },
    indicacion: { type: String, default: null },
    categoria: { type: String, default: null },
    obligatorio: { type: Boolean, default: true },
    estado: { type: String, enum: ESTADOS_DOCUMENTO_MATRICULA, default: 'PENDIENTE' },
    archivo_path: { type: String, default: null },
    comentario: { type: String, default: null },
    fecha_carga: { type: Date, default: null },
    revisado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    cargado_por_tipo: { type: String, enum: ['FAMILIA', 'PERSONAL', null], default: null },
    cargado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    fecha_verificacion_fisica: { type: Date, default: null },
  },
  { _id: false }
);

const soporteSalidaSchema = new Schema<ISoporteSalida>({
  nombre: { type: String, required: true },
  archivo_path: { type: String, required: true },
  mimetype: { type: String, required: true },
  tamano: { type: Number, required: true },
  cargado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  fecha: { type: Date, required: true },
});

const salidaSchema = new Schema<ISalidaMatricula>(
  {
    tipo: { type: String, enum: TIPOS_SALIDA, required: true },
    fecha_efectiva: { type: Date, required: true },
    motivo: { type: String, required: true, trim: true },
    observaciones: { type: String, default: '', trim: true },
    institucion_receptora: {
      type: new Schema({ nombre: { type: String, required: true, trim: true }, codigo_dane: { type: String, default: '', trim: true }, municipio: { type: String, default: '', trim: true } }, { _id: false }),
      default: null,
    },
    estado_previo: { type: String, enum: ESTADOS_MATRICULA, required: true },
    registrado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fecha_registro: { type: Date, required: true },
    cupo_liberado: { type: Boolean, default: false },
    fecha_cupo_liberado: { type: Date, default: null },
    soportes: { type: [soporteSalidaSchema], default: [] },
  },
  { _id: false }
);

const tramoTrayectoriaSchema = new Schema<ITramoTrayectoria>(
  {
    group_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    desde: { type: Date, required: true },
    hasta: { type: Date, default: null },
  },
  { _id: false }
);

const enrollmentSchema = new Schema<IEnrollment, EnrollmentModel>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    group_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    folio_matricula: { type: String, default: null },
    numero_libro: { type: Number, default: null, min: 1 },
    numero_folio: { type: Number, default: null, min: 1 },
    tipo_ingreso: { type: String, enum: TIPOS_INGRESO, required: true },
    estado: { type: String, enum: ESTADOS_MATRICULA, default: 'PREINSCRITO' },
    fecha_matricula: { type: Date, default: Date.now },
    fecha_limite_compromiso: { type: Date, default: null },
    fecha_limite_legalizacion: { type: Date, default: null },
    motivo_retiro: { type: String, default: null },
    ultimo_grado_aprobado: { type: Number, min: -2, max: 11, default: null },
    salida: { type: salidaSchema, default: null },
    trayectoria: { type: [tramoTrayectoriaSchema], default: [] },
    checklist: { type: [checklistItemSchema], default: [] },
    novedades: {
      type: [
        new Schema(
          {
            tipo: { type: String, required: true },
            texto: { type: String, required: true },
            referencia: { type: String, required: true },
            fecha: { type: Date, required: true },
            por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    origen: { type: String, enum: ['IMPORTACION_SIMAT', null], default: null },
    importacion_simat_id: { type: Schema.Types.ObjectId, ref: 'ImportacionSimat', default: null },
  },
  { timestamps: true }
);

enrollmentSchema.index({ student_id: 1, academic_year_id: 1, estado: 1 });
enrollmentSchema.index({ group_id: 1 });
// Una sola matrícula viva por estudiante y año lectivo: para cambiarlo de grupo se actualiza la existente (`cambiarGrupo`), no se crea otra.
enrollmentSchema.index(
  { student_id: 1, academic_year_id: 1 },
  { unique: true, name: 'matricula_viva_unica', partialFilterExpression: { estado: { $in: ESTADOS_MATRICULA_VIVOS } } }
);
// Unicos solo entre matriculas que ya tienen folio: los PREINSCRITOS (null) no chocan entre si.
enrollmentSchema.index({ folio_matricula: 1 }, { unique: true, partialFilterExpression: { folio_matricula: { $type: 'string' } } });
enrollmentSchema.index(
  { numero_libro: 1, numero_folio: 1 },
  { unique: true, partialFilterExpression: { numero_folio: { $type: 'number' } } }
);

// Invariante del Libro de Matricula: toda matricula formalizada tiene folio.
enrollmentSchema.pre('validate', function validarFolio(this: IEnrollment, next) {
  if (ESTADOS_MATRICULA_CON_FOLIO.includes(this.estado) && !this.folio_matricula) {
    return next(new Error('Una matrícula formalizada debe tener folio asignado.'));
  }
  next();
});

// La salida es un asiento histórico: lo que dice quién, cuándo y por qué no se reescribe (los soportes y el cupo sí avanzan).
const CAMPOS_INMUTABLES_DE_SALIDA = ['salida.tipo', 'salida.fecha_efectiva', 'salida.motivo', 'salida.estado_previo', 'salida.registrado_por', 'salida.fecha_registro'];
enrollmentSchema.pre('save', function protegerSalida(this: EnrollmentDocument, next) {
  if (!this.isNew && !this.isModified('estado') && CAMPOS_INMUTABLES_DE_SALIDA.some((campo) => this.isModified(campo))) {
    return next(new Error('La salida registrada de una matrícula no se modifica.'));
  }
  next();
});

// Primer tramo de la trayectoria: el grupo en el que nace la matrícula. Los cambios de grupo y la salida lo cierran y abren otros.
enrollmentSchema.pre('validate', function abrirTrayectoria(this: EnrollmentDocument, next) {
  if (this.isNew && this.trayectoria.length === 0) {
    this.trayectoria.push({ group_id: this.group_id, desde: this.fecha_matricula ?? new Date(), hasta: null });
  }
  next();
});

// Una matrícula con folio es un asiento del Libro de Matrícula: no se borra (se retira o se anula, y queda).
enrollmentSchema.pre('deleteOne', { document: true, query: false }, function noBorrarAsientos(this: EnrollmentDocument, next) {
  if (this.folio_matricula) return next(new Error('Una matrícula con folio es un asiento del Libro de Matrícula y no se elimina.'));
  next();
});

export const Enrollment = model<IEnrollment, EnrollmentModel>('Enrollment', enrollmentSchema);
export default Enrollment;
