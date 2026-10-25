/** Espejo de `backend/src/constants/sitioPublico.ts`: si cambia un contrato allá, cambia aquí. */
export type SeccionSitio = 'admisiones' | 'tramites' | 'oferta' | 'contacto';
export type PosicionLogo = 'izquierda' | 'centro' | 'lateral';
export type PosicionMenu = 'superior' | 'bajo_logo' | 'lateral';

export interface ConfiguracionSitio {
  plantilla: string;
  logo_posicion: PosicionLogo;
  menu_posicion: PosicionMenu;
  tipografia: { fuente_titulo: string; color_titulo: string; fuente_texto: string; color_texto: string };
  secciones: { clave: SeccionSitio; visible: boolean }[];
}

export interface ImagenSitio {
  id: string;
  /** Fecha (ms) de la imagen: sirve de versión en la URL. */
  version: number;
}

/** Lo que dibuja la página pública. `imagenes` solo viene si la plantilla tiene carrusel. */
export interface VistaSitio extends ConfiguracionSitio {
  imagenes: ImagenSitio[];
}

export interface PlantillaSitio {
  id: string;
  nombre: string;
  descripcion: string;
  slider: boolean;
  logo: PosicionLogo[];
  menu: PosicionMenu[];
}

export interface SitioParaAdministrar {
  configuracion: ConfiguracionSitio;
  imagenes: ImagenSitio[];
  plantillas: PlantillaSitio[];
  fuentes: string[];
  max_imagenes: number;
}

export const ETIQUETA_SECCION: Record<SeccionSitio, string> = {
  admisiones: 'Admisiones',
  tramites: 'Trámites y servicios',
  oferta: 'Oferta académica',
  contacto: 'Contacto (pie de página)',
};

export const ETIQUETA_LOGO: Record<PosicionLogo, string> = { izquierda: 'A la izquierda', centro: 'Centrado', lateral: 'En el menú lateral' };
export const ETIQUETA_MENU: Record<PosicionMenu, string> = { superior: 'Barra superior', bajo_logo: 'Debajo del logo', lateral: 'Lateral' };

/** Mientras la configuración carga (o si falla) la página se ve como siempre: el módulo nunca debe dejarla en blanco. */
export const CONFIGURACION_SITIO_INICIAL: ConfiguracionSitio = {
  plantilla: 'clasica',
  logo_posicion: 'izquierda',
  menu_posicion: 'superior',
  tipografia: { fuente_titulo: 'Plus Jakarta Sans', color_titulo: '#172235', fuente_texto: 'Plus Jakarta Sans', color_texto: '#3F4D61' },
  secciones: [
    { clave: 'admisiones', visible: true },
    { clave: 'tramites', visible: true },
    { clave: 'oferta', visible: true },
    { clave: 'contacto', visible: true },
  ],
};
