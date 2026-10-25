import { HydratedDocument, Model, Schema, model } from 'mongoose';
import {
  CONFIGURACION_SITIO_INICIAL,
  COLOR_HEX,
  FUENTES_SITIO,
  POSICIONES_LOGO,
  POSICIONES_MENU,
  PLANTILLAS_SITIO,
  SECCIONES_SITIO,
  ConfiguracionSitio,
} from '../constants/sitioPublico';

/** Personalización de la página pública del colegio: una sola por instalación. No afecta ninguna pantalla con sesión. */
export type ISitioPublico = ConfiguracionSitio & { actualizado_en: Date };
export type SitioPublicoDocument = HydratedDocument<ISitioPublico>;

const color = { type: String, match: COLOR_HEX, required: true };

const sitioPublicoSchema = new Schema<ISitioPublico, Model<ISitioPublico>>({
  plantilla: { type: String, enum: PLANTILLAS_SITIO.map((p) => p.id), default: CONFIGURACION_SITIO_INICIAL.plantilla },
  logo_posicion: { type: String, enum: POSICIONES_LOGO, default: CONFIGURACION_SITIO_INICIAL.logo_posicion },
  menu_posicion: { type: String, enum: POSICIONES_MENU, default: CONFIGURACION_SITIO_INICIAL.menu_posicion },
  tipografia: {
    fuente_titulo: { type: String, enum: FUENTES_SITIO, required: true },
    color_titulo: color,
    fuente_texto: { type: String, enum: FUENTES_SITIO, required: true },
    color_texto: color,
  },
  secciones: [{ _id: false, clave: { type: String, enum: SECCIONES_SITIO, required: true }, visible: { type: Boolean, default: true } }],
  actualizado_en: { type: Date, default: Date.now },
});

export const SitioPublico = model<ISitioPublico, Model<ISitioPublico>>('SitioPublico', sitioPublicoSchema);
export default SitioPublico;
