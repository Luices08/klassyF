import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  ACTORES_PMI,
  ActorPmi,
  CODIGOS_CATEGORIA_DISCAPACIDAD,
  CategoriaDiscapacidad,
  DIMENSIONES_TRANSVERSALES,
  DimensionTransversal,
  ESTADOS_EXPEDIENTE,
  EstadoExpediente,
  FRECUENCIAS_COMPROMISO,
  FrecuenciaCompromiso,
  MAX_TEXTO_CORTO,
  MAX_TEXTO_LARGO,
  NIVELES_FORMACION_FAMILIAR,
  NivelFormacionFamiliar,
  TIPOS_EXPEDIENTE,
  TIPOS_NECESIDAD_PLAN_APOYO,
  TipoExpediente,
  TipoNecesidadPlanApoyo,
} from '../constants/inclusion';

const corto = { type: String, trim: true, maxlength: MAX_TEXTO_CORTO, default: '' };
const largo = { type: String, trim: true, maxlength: MAX_TEXTO_LARGO, default: '' };

// --- Anexo 1: información general (se diligencia con la familia). EPS y régimen NO se guardan: salen de M03 al emitir el documento. ---

interface IPersonaHogar {
  nombre: string;
  ocupacion: string;
  nivel_educativo: NivelFormacionFamiliar | null;
}
export interface IAnexoInfoGeneral {
  salud: {
    afiliado_sistema_salud: boolean | null;
    lugar_atencion_emergencia: string;
    atendido_sector_salud: boolean | null;
    frecuencia_atencion: string;
    diagnostico_medico: string;
    terapias: { nombre: string; frecuencia: string }[];
    tratamiento_medico: string;
    medicamentos: { nombre: string; frecuencia_horario: string; en_horario_escolar: boolean }[];
    productos_apoyo: string[];
  };
  hogar: {
    madre: IPersonaHogar;
    padre: IPersonaHogar;
    cuidador: { nombre: string; parentesco: string; nivel_educativo: NivelFormacionFamiliar | null; telefono: string; correo: string };
    numero_hermanos: number | null;
    lugar_que_ocupa: number | null;
    vive_con: string;
    quienes_apoyan_crianza: string;
    bajo_proteccion: boolean | null;
    subsidios: string;
  };
  educativo: {
    vinculado_otra_institucion: boolean | null;
    instituciones_previas: string;
    motivo_cambio: string;
    ultimo_grado_cursado: string;
    aprobo_ultimo_grado: boolean | null;
    informe_pedagogico_previo: boolean | null;
    procedencia_informe: string;
    programas_complementarios: string;
    medio_transporte: string;
    tiempo_desplazamiento: string;
  };
}

const personaHogarSchema = new Schema<IPersonaHogar>(
  { nombre: corto, ocupacion: corto, nivel_educativo: { type: String, enum: [...NIVELES_FORMACION_FAMILIAR, null], default: null } },
  { _id: false }
);

const anexoInfoGeneralSchema = new Schema<IAnexoInfoGeneral>(
  {
    salud: {
      afiliado_sistema_salud: { type: Boolean, default: null },
      lugar_atencion_emergencia: corto,
      atendido_sector_salud: { type: Boolean, default: null },
      frecuencia_atencion: corto,
      diagnostico_medico: largo,
      terapias: { type: [new Schema({ nombre: corto, frecuencia: corto }, { _id: false })], default: [] },
      tratamiento_medico: largo,
      medicamentos: {
        type: [new Schema({ nombre: corto, frecuencia_horario: corto, en_horario_escolar: { type: Boolean, default: false } }, { _id: false })],
        default: [],
      },
      productos_apoyo: { type: [corto], default: [] },
    },
    hogar: {
      madre: { type: personaHogarSchema, default: () => ({}) },
      padre: { type: personaHogarSchema, default: () => ({}) },
      cuidador: {
        nombre: corto,
        parentesco: corto,
        nivel_educativo: { type: String, enum: [...NIVELES_FORMACION_FAMILIAR, null], default: null },
        telefono: corto,
        correo: corto,
      },
      numero_hermanos: { type: Number, min: 0, max: 30, default: null },
      lugar_que_ocupa: { type: Number, min: 1, max: 30, default: null },
      vive_con: corto,
      quienes_apoyan_crianza: corto,
      bajo_proteccion: { type: Boolean, default: null },
      subsidios: corto,
    },
    educativo: {
      vinculado_otra_institucion: { type: Boolean, default: null },
      instituciones_previas: corto,
      motivo_cambio: corto,
      ultimo_grado_cursado: corto,
      aprobo_ultimo_grado: { type: Boolean, default: null },
      informe_pedagogico_previo: { type: Boolean, default: null },
      procedencia_informe: corto,
      programas_complementarios: corto,
      medio_transporte: corto,
      tiempo_desplazamiento: corto,
    },
  },
  { _id: false }
);

// --- Anexo 2: características, transversales y PMI ---

export interface ICaracteristicas {
  descripcion_general: string;
  gustos_intereses: string;
  aspectos_que_le_desagradan: string;
  expectativas_estudiante: string;
  expectativas_familia: string;
  lo_que_hace_puede_requiere_apoyo: string;
  habilidades_competencias: string;
  valoracion_pedagogica: string;
  barreras_generales: string;
  recomendaciones_aula: string;
  pautas_evaluacion: string;
  /** Único dato "médico" que ve el docente: lo redacta orientación y es solo lo necesario para la seguridad en el aula. */
  alerta_seguridad_aula: string;
  recursos_necesarios: string;
  proyectos_especificos: string;
  otra_informacion: string;
  actividades_en_casa_receso: string;
}

const caracteristicasSchema = new Schema<ICaracteristicas>(
  {
    descripcion_general: largo,
    gustos_intereses: largo,
    aspectos_que_le_desagradan: largo,
    expectativas_estudiante: largo,
    expectativas_familia: largo,
    lo_que_hace_puede_requiere_apoyo: largo,
    habilidades_competencias: largo,
    valoracion_pedagogica: largo,
    barreras_generales: largo,
    recomendaciones_aula: largo,
    pautas_evaluacion: largo,
    alerta_seguridad_aula: corto,
    recursos_necesarios: largo,
    proyectos_especificos: largo,
    otra_informacion: largo,
    actividades_en_casa_receso: largo,
  },
  { _id: false }
);

export interface ITransversal {
  dimension: DimensionTransversal;
  objetivo: string;
  barrera: string;
  ajuste: string;
  evaluacion: string;
}
export interface IAccionPmi {
  actor: ActorPmi;
  accion: string;
  estrategia: string;
}
export interface ICompromisoFamilia {
  actividad: string;
  descripcion: string;
  frecuencia: FrecuenciaCompromiso;
}

export interface IConsentimiento {
  otorgado: boolean;
  otorgado_por_nombre: string | null;
  parentesco: string | null;
  fecha: Date | null;
  version_politica: string | null;
  registrado_por_id: Types.ObjectId | null;
  revocado: { fecha: Date; por: Types.ObjectId; motivo: string } | null;
}

export interface ISoporteClinico {
  _id: Types.ObjectId;
  nombre: string;
  descripcion: string;
  archivo_path: string;
  hash: string;
  cargado_por: Types.ObjectId;
  fecha: Date;
}

export interface IPlanApoyo {
  tipo_necesidad: TipoNecesidadPlanApoyo | null;
  observacion_inicial: string;
  compromisos_casa: string;
  pautas_aula: string[];
  pautas_evaluacion: string;
}

export interface IInformeAnual {
  logros: string;
  dificultades_persistentes: string;
  eficacia_de_ajustes: string;
  recomendaciones_grado_siguiente: string;
  ajustes_a_mantener: string;
}

export interface IExpedienteInclusion {
  student_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  /** Sede del grupo al abrir; el alcance real se recalcula desde la matrícula vigente (el estudiante puede cambiar de grupo). */
  sede_id: Types.ObjectId;
  tipo: TipoExpediente;
  estado: EstadoExpediente;
  categoria_discapacidad: CategoriaDiscapacidad;
  solicitud_id: Types.ObjectId | null;
  consentimiento: IConsentimiento;
  anexo_info_general: IAnexoInfoGeneral;
  caracteristicas: ICaracteristicas;
  transversales: ITransversal[];
  pmi: IAccionPmi[];
  compromisos_familia: ICompromisoFamilia[];
  compromisos_aula: string;
  plan_apoyo: IPlanApoyo;
  /** Informe anual de proceso pedagógico (preescolar) o de competencias (básica y media), anexo al boletín final. */
  informe_anual: IInformeAnual;
  soportes: Types.DocumentArray<ISoporteClinico>;
  /** Sube al agregar o cambiar ajustes con el expediente ya ACTIVO (el PIAR es progresivo); lo firmado no cambia. */
  version: number;
  fecha_limite_elaboracion: Date | null;
  aprobado: { por: Types.ObjectId; fecha: Date } | null;
  cierre: { por: Types.ObjectId; fecha: Date; motivo: string } | null;
  creado_por: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type ExpedienteInclusionDocument = HydratedDocument<IExpedienteInclusion>;
type ExpedienteInclusionModel = Model<IExpedienteInclusion>;

const soporteSchema = new Schema<ISoporteClinico>({
  nombre: { type: String, required: true, maxlength: 120 },
  descripcion: corto,
  archivo_path: { type: String, required: true },
  hash: { type: String, required: true },
  cargado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  fecha: { type: Date, default: Date.now },
});

const expedienteSchema = new Schema<IExpedienteInclusion, ExpedienteInclusionModel>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    sede_id: { type: Schema.Types.ObjectId, ref: 'Campus', required: true },
    tipo: { type: String, enum: TIPOS_EXPEDIENTE, required: true },
    estado: { type: String, enum: ESTADOS_EXPEDIENTE, default: 'BORRADOR' },
    categoria_discapacidad: { type: String, enum: CODIGOS_CATEGORIA_DISCAPACIDAD, default: 'POR_CONFIRMAR' },
    solicitud_id: { type: Schema.Types.ObjectId, ref: 'SolicitudApoyo', default: null },
    consentimiento: {
      type: new Schema<IConsentimiento>(
        {
          otorgado: { type: Boolean, default: false },
          otorgado_por_nombre: { type: String, default: null, maxlength: 120 },
          parentesco: { type: String, default: null, maxlength: 60 },
          fecha: { type: Date, default: null },
          version_politica: { type: String, default: null },
          registrado_por_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
          revocado: {
            type: new Schema(
              { fecha: Date, por: { type: Schema.Types.ObjectId, ref: 'User' }, motivo: { type: String, maxlength: MAX_TEXTO_CORTO } },
              { _id: false }
            ),
            default: null,
          },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    anexo_info_general: { type: anexoInfoGeneralSchema, default: () => ({}) },
    caracteristicas: { type: caracteristicasSchema, default: () => ({}) },
    transversales: {
      type: [
        new Schema<ITransversal>(
          { dimension: { type: String, enum: DIMENSIONES_TRANSVERSALES, required: true }, objetivo: largo, barrera: largo, ajuste: largo, evaluacion: largo },
          { _id: false }
        ),
      ],
      default: [],
    },
    pmi: {
      type: [new Schema<IAccionPmi>({ actor: { type: String, enum: ACTORES_PMI, required: true }, accion: largo, estrategia: largo }, { _id: false })],
      default: [],
    },
    compromisos_familia: {
      type: [
        new Schema<ICompromisoFamilia>(
          { actividad: { ...corto, required: true }, descripcion: largo, frecuencia: { type: String, enum: FRECUENCIAS_COMPROMISO, required: true } },
          { _id: false }
        ),
      ],
      default: [],
    },
    compromisos_aula: largo,
    plan_apoyo: {
      type: new Schema<IPlanApoyo>(
        {
          tipo_necesidad: { type: String, enum: [...TIPOS_NECESIDAD_PLAN_APOYO, null], default: null },
          observacion_inicial: largo,
          compromisos_casa: largo,
          pautas_aula: { type: [corto], default: [] },
          pautas_evaluacion: largo,
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    informe_anual: {
      type: new Schema<IInformeAnual>(
        { logros: largo, dificultades_persistentes: largo, eficacia_de_ajustes: largo, recomendaciones_grado_siguiente: largo, ajustes_a_mantener: largo },
        { _id: false }
      ),
      default: () => ({}),
    },
    soportes: { type: [soporteSchema], default: [] },
    version: { type: Number, default: 1, min: 1 },
    fecha_limite_elaboracion: { type: Date, default: null },
    aprobado: {
      type: new Schema({ por: { type: Schema.Types.ObjectId, ref: 'User', required: true }, fecha: { type: Date, required: true } }, { _id: false }),
      default: null,
    },
    cierre: {
      type: new Schema(
        { por: { type: Schema.Types.ObjectId, ref: 'User', required: true }, fecha: { type: Date, required: true }, motivo: { type: String, required: true, maxlength: MAX_TEXTO_CORTO } },
        { _id: false }
      ),
      default: null,
    },
    creado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Un expediente por estudiante y año (el grupo puede cambiar durante el año; la matrícula es la que lo ubica).
expedienteSchema.index({ student_id: 1, academic_year_id: 1 }, { unique: true });
expedienteSchema.index({ sede_id: 1, estado: 1, updatedAt: -1 });

// Un expediente CERRADO (año cerrado, retiro) es histórico: solo admite que se lea.
expedienteSchema.pre('save', function protegerExpedienteCerrado(next) {
  if (this.estado === 'CERRADO' && !this.isNew && !this.isModified('estado')) {
    const tocados = this.modifiedPaths().filter((ruta) => ruta !== 'updatedAt');
    if (tocados.length > 0) return next(new Error('Un expediente cerrado es histórico y no se puede modificar.'));
  }
  next();
});

export const ExpedienteInclusion = model<IExpedienteInclusion, ExpedienteInclusionModel>('ExpedienteInclusion', expedienteSchema);
export default ExpedienteInclusion;
