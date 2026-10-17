import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  CLAVES_TEXTOS_BOLETIN,
  FUENTES_BOLETIN,
  MAX_FIRMAS_BOLETIN,
  MAX_LONGITUD_APOYO_BOLETIN,
  MAX_LONGITUD_CANAL_RECLAMACIONES,
  MAX_LONGITUD_PIE_BOLETIN,
  MAX_LONGITUD_TEXTO_BOLETIN,
  MAX_LONGITUD_TITULO_BOLETIN,
  MAX_OPCIONES_PROMOCION,
  PAPELES_BOLETIN,
  POSICIONES_ESCUDO,
  PlantillaBoletin,
  SECCIONES_BOLETIN,
  TAMANOS_TEXTO_BOLETIN,
} from '../constants/boletin';

/** Fecha en que el colegio entrega el informe de un periodo (el SIEE debe definir la periodicidad: Decreto 1075, art. 2.3.3.3.3.4, num. 8). */
export interface IEntregaBoletin {
  academic_year_id: Types.ObjectId;
  periodo_numero: number;
  fecha_entrega: Date;
}

/**
 * Política y diseño del boletín del colegio (una por instalación). Solo presentación e información: no cambia ninguna nota.
 * `plantilla` guarda lo que el colegio personalizó del documento; lo que falte se completa con el diseño original
 * (`utils/plantillaBoletin#completarPlantilla`), así una opción nueva del sistema no rompe una plantilla ya guardada.
 */
export interface IConfiguracionBoletin {
  institucion_id: Types.ObjectId;
  /** Instancia, procedimiento y plazo para pedir aclaraciones o presentar reclamaciones, tal como los define el SIEE. */
  canal_reclamaciones: string;
  mostrar_puesto: boolean;
  /** SIEE: el boletín parcial de retiro incluye también las notas parciales de corte del periodo en curso (sin cerrar). Apagado: solo lo cerrado. */
  incluir_corte_en_retiro: boolean;
  /** SIEE: el PDF del boletín parcial de retiro solo se entrega con el paz y salvo de salida aprobado. */
  exigir_paz_y_salvo_en_retiro: boolean;
  entregas: Types.DocumentArray<IEntregaBoletin>;
  plantilla: PlantillaBoletin | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ConfiguracionBoletinDocument = HydratedDocument<IConfiguracionBoletin>;
type ConfiguracionBoletinModel = Model<IConfiguracionBoletin>;

const entregaSchema = new Schema<IEntregaBoletin>(
  {
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    periodo_numero: { type: Number, required: true, min: 1 },
    fecha_entrega: { type: Date, required: true },
  },
  { _id: false }
);

const texto = (max: number) => ({ type: String, trim: true, maxlength: max, default: '' });

const plantillaSchema = new Schema<PlantillaBoletin>(
  {
    titulo: texto(MAX_LONGITUD_TITULO_BOLETIN),
    subtitulo: texto(MAX_LONGITUD_TITULO_BOLETIN),
    mostrar_datos_institucion: { type: Boolean, default: true },
    mostrar_sede_jornada: { type: Boolean, default: true },
    escudo: {
      mostrar: { type: Boolean, default: true },
      posicion: { type: String, enum: POSICIONES_ESCUDO, default: 'IZQUIERDA' },
      tamano: { type: Number, min: 1, default: 52 },
      url: { type: String, default: null },
    },
    color_acento: { type: String, match: /^#[0-9a-fA-F]{6}$/, default: '#2878EA' },
    papel: { type: String, enum: PAPELES_BOLETIN, default: 'LETTER' },
    fuente: { type: String, enum: FUENTES_BOLETIN, default: 'SANS' },
    tamano_texto: { type: String, enum: TAMANOS_TEXTO_BOLETIN, default: 'NORMAL' },
    secciones: [
      new Schema(
        {
          clave: { type: String, enum: SECCIONES_BOLETIN, required: true },
          titulo: texto(MAX_LONGITUD_TITULO_BOLETIN),
          visible: { type: Boolean, default: true },
        },
        { _id: false }
      ),
    ],
    estudiante: {
      documento: { type: Boolean, default: true },
      grado: { type: Boolean, default: true },
      grupo: { type: Boolean, default: true },
      inasistencias: { type: Boolean, default: true },
      promedio: { type: Boolean, default: true },
    },
    asignaturas: {
      nota: { type: Boolean, default: true },
      desempeno: { type: Boolean, default: true },
      fallas: { type: Boolean, default: true },
      nota_area: { type: Boolean, default: true },
      componentes: { type: Boolean, default: false },
      descripcion: { type: Boolean, default: true },
      recomendacion: { type: Boolean, default: true },
      observacion: { type: Boolean, default: true },
    },
    rotulos: {
      componentes: texto(60),
      descripcion: texto(60),
      recomendacion: texto(60),
      observacion: texto(60),
    },
    textos: Object.fromEntries(CLAVES_TEXTOS_BOLETIN.map((clave) => [clave, texto(MAX_LONGITUD_TEXTO_BOLETIN)])),
    texto_apoyo: texto(MAX_LONGITUD_APOYO_BOLETIN),
    compromisos_lineas: { type: Number, min: 1, max: 10, default: 3 },
    promocion_opciones: {
      type: [{ type: String, trim: true, maxlength: 40 }],
      validate: { validator: (opciones: unknown[]) => opciones.length <= MAX_OPCIONES_PROMOCION, message: `Máximo ${MAX_OPCIONES_PROMOCION} opciones de promoción.` },
    },
    firmas: {
      type: [
        new Schema(
          {
            cargo: texto(80),
            nombre: texto(80),
            usa_director_grupo: { type: Boolean, default: false },
          },
          { _id: false }
        ),
      ],
      validate: { validator: (firmas: unknown[]) => firmas.length <= MAX_FIRMAS_BOLETIN, message: `Máximo ${MAX_FIRMAS_BOLETIN} firmas.` },
    },
    pie_texto: texto(MAX_LONGITUD_PIE_BOLETIN),
  },
  { _id: false }
);

const configuracionBoletinSchema = new Schema<IConfiguracionBoletin, ConfiguracionBoletinModel>(
  {
    institucion_id: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, unique: true },
    canal_reclamaciones: { type: String, trim: true, maxlength: MAX_LONGITUD_CANAL_RECLAMACIONES, default: '' },
    mostrar_puesto: { type: Boolean, default: true },
    incluir_corte_en_retiro: { type: Boolean, default: false },
    exigir_paz_y_salvo_en_retiro: { type: Boolean, default: false },
    entregas: { type: [entregaSchema], default: [] },
    plantilla: { type: plantillaSchema, default: null },
  },
  { timestamps: true }
);

export const ConfiguracionBoletin = model<IConfiguracionBoletin, ConfiguracionBoletinModel>('ConfiguracionBoletin', configuracionBoletinSchema);
export default ConfiguracionBoletin;
