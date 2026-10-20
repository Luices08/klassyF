import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { NIVELES_EDUCATIVOS } from '../constants/enums';
import {
  ACCIONES_REGLA,
  CONDICIONES_ARRASTRE,
  CONSECUENCIAS_INCUMPLIR_ARRASTRE,
  EFECTOS_IMPRESCINDIBLES,
  EFECTOS_NOTA_RECUPERACION,
  FALTAS_COMPUTABLES,
  FILTROS_CRITICIDAD,
  MAX_CARACTERES_TEXTO_SIEE_PROMOCION,
  MAX_NOMBRE_REGLA,
  MODOS_LISTA,
  MOMENTOS_PROMOCION,
  NIVELES_ACCION_SIN_REGLA,
  TIPOS_CONDICION,
  UNIDADES_PROMOCION,
} from '../constants/promocion';
import { PoliticaPromocion } from '../utils/promocion';

/**
 * Política de promoción del colegio para un año lectivo (M19): su SIEE hecho datos. Una por año; un año nuevo parte de la del anterior.
 * Que sus claves, acciones y periodos sean coherentes lo valida el servicio (`validarPolitica`), porque depende del año.
 */
export interface IPoliticaPromocion extends PoliticaPromocion {
  academic_year_id: Types.ObjectId;
  actualizado_por: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PoliticaPromocionDocument = HydratedDocument<IPoliticaPromocion>;
type PoliticaPromocionModel = Model<IPoliticaPromocion>;

// Ids como texto: solo se comparan por pertenencia en el motor (que es puro y trabaja con strings), nunca se cruzan en la base.
const idsSchema = { type: [String], default: [] };

const condicionSchema = new Schema(
  {
    tipo: { type: String, enum: TIPOS_CONDICION, required: true },
    n: { type: Number, min: 0, max: 1000, default: null },
    porcentaje: { type: Number, min: 0, max: 100, default: null },
    nota: { type: Number, min: 0, default: null },
    filtro: { type: String, enum: FILTROS_CRITICIDAD, default: null },
    unidad: { type: String, enum: ['ASIGNATURA', 'AREA'], default: null },
    faltas: { type: String, enum: FALTAS_COMPUTABLES, default: null },
    modo: { type: String, enum: MODOS_LISTA, default: null },
    subject_ids: idsSchema,
    area_ids: idsSchema,
    gravedad: { type: String, trim: true, default: null },
  },
  { _id: false }
);

const reglaSchema = new Schema(
  {
    clave: { type: String, required: true, trim: true },
    nombre: { type: String, required: true, trim: true, maxlength: MAX_NOMBRE_REGLA },
    activa: { type: Boolean, default: true },
    momentos: { type: [{ type: String, enum: MOMENTOS_PROMOCION }], default: [] },
    niveles: { type: [{ type: String, enum: NIVELES_EDUCATIVOS }], default: [] },
    grados_ids: idsSchema,
    condiciones: { type: [condicionSchema], default: [] },
    accion: { type: String, enum: ACCIONES_REGLA, required: true },
  },
  { _id: false }
);

const politicaPromocionSchema = new Schema<IPoliticaPromocion, PoliticaPromocionModel>(
  {
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true, unique: true },
    unidad: { type: String, enum: UNIDADES_PROMOCION, required: true },
    area_pierde_con_asignatura_perdida: { type: Boolean, default: false },
    asignaturas_criticas_ids: idsSchema,
    areas_criticas_ids: idsSchema,
    asignaturas_arrastrables_ids: idsSchema,
    areas_arrastrables_ids: idsSchema,
    reglas: { type: [reglaSchema], default: [] },
    inasistencia: {
      type: new Schema(
        {
          activa: { type: Boolean, default: false },
          porcentaje: { type: Number, min: 0, max: 100, default: 25 },
          faltas: { type: String, enum: FALTAS_COMPUTABLES, default: 'SOLO_INJUSTIFICADAS' },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    imprescindibles: {
      type: new Schema({ efecto: { type: String, enum: EFECTOS_IMPRESCINDIBLES, default: null } }, { _id: false }),
      default: () => ({}),
    },
    umbrales: {
      type: new Schema(
        {
          recuperacion_hasta: { type: Number, min: 0, max: 50, default: null },
          reprueba_desde_areas: { type: Number, min: 1, max: 50, default: null },
          efecto_nota_recuperacion: { type: String, enum: EFECTOS_NOTA_RECUPERACION, default: 'LIMITA_A_APROBATORIA' },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    sin_regla: {
      type: new Schema(
        {
          cierre: { type: String, enum: NIVELES_ACCION_SIN_REGLA, required: true },
          tras_recuperacion: { type: String, enum: NIVELES_ACCION_SIN_REGLA, required: true },
        },
        { _id: false }
      ),
      required: true,
    },
    arrastre: {
      type: new Schema(
        {
          admite: { type: Boolean, required: true },
          max_unidades: { type: Number, required: true, min: 1, max: 20 },
          condicion: { type: String, enum: CONDICIONES_ARRASTRE, required: true },
          nota_minima: { type: Number, min: 0, default: null },
          hasta_periodo: { type: Number, required: true, min: 1, max: 12 },
          si_incumple: { type: String, enum: CONSECUENCIAS_INCUMPLIR_ARRASTRE, required: true },
        },
        { _id: false }
      ),
      required: true,
    },
    piar: { type: new Schema({ derivar_a_comision: { type: Boolean, required: true } }, { _id: false }), required: true },
    titulacion: {
      type: new Schema(
        {
          grado_titulacion: { type: Number, min: 1, max: 11, default: 11 },
          servicio_social: {
            type: new Schema(
              {
                activo: { type: Boolean, default: true },
                horas_requeridas: { type: Number, min: 1, max: 2000, default: 80 },
                alerta_desde_grado: { type: Number, min: -2, max: 11, default: 10 },
              },
              { _id: false }
            ),
            default: () => ({}),
          },
          saber_11: { type: new Schema({ activo: { type: Boolean, default: true } }, { _id: false }), default: () => ({}) },
          paz_y_salvo: { type: new Schema({ activo: { type: Boolean, default: true } }, { _id: false }), default: () => ({}) },
          carpeta_academica: {
            type: new Schema({ activo: { type: Boolean, default: false }, desde_grado: { type: Number, min: -2, max: 10, default: 1 } }, { _id: false }),
            default: () => ({}),
          },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    texto_siee: { type: String, trim: true, maxlength: MAX_CARACTERES_TEXTO_SIEE_PROMOCION, default: '' },
    actualizado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

export const PoliticaPromocionModelo = model<IPoliticaPromocion, PoliticaPromocionModel>('PoliticaPromocion', politicaPromocionSchema);
export default PoliticaPromocionModelo;
