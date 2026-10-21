/** Fuentes de Google Fonts ofrecidas para el sitio público (lista curada: legibles y de carga liviana). */
export const FUENTES_SITIO = [
  'Plus Jakarta Sans',
  'Inter',
  'Poppins',
  'Montserrat',
  'Roboto',
  'Open Sans',
  'Lato',
  'Nunito',
  'Raleway',
  'Merriweather',
  'Playfair Display',
  'Lora',
] as const;
export type FuenteSitio = (typeof FUENTES_SITIO)[number];

/** Bloques de contenido que el colegio puede mostrar, ocultar y reordenar. El hero (inicio) y el pie de contacto básico no se apagan. */
export const SECCIONES_SITIO = ['admisiones', 'tramites', 'oferta', 'contacto'] as const;
export type SeccionSitio = (typeof SECCIONES_SITIO)[number];

export const POSICIONES_LOGO = ['izquierda', 'centro', 'lateral'] as const;
export type PosicionLogo = (typeof POSICIONES_LOGO)[number];

export const POSICIONES_MENU = ['superior', 'bajo_logo', 'lateral'] as const;
export type PosicionMenu = (typeof POSICIONES_MENU)[number];

export interface PlantillaSitio {
  id: string;
  nombre: string;
  descripcion: string;
  /** Si la plantilla tiene carrusel de imágenes; si no, el módulo no ofrece subirlas. */
  slider: boolean;
  /** Ubicaciones que admite el diseño; la primera es la de partida. */
  logo: readonly PosicionLogo[];
  menu: readonly PosicionMenu[];
}

/** Una plantilla nueva es una entrada aquí y su componente en el frontend (`components/sitioPublico/plantillas`). */
export const PLANTILLAS_SITIO: readonly PlantillaSitio[] = [
  {
    id: 'clasica',
    nombre: 'Clásica',
    descripcion: 'Barra superior, titular centrado y secciones en columna. Sin carrusel.',
    slider: false,
    logo: ['izquierda', 'centro'],
    menu: ['superior'],
  },
  {
    id: 'galeria',
    nombre: 'Galería',
    descripcion: 'Carrusel de imágenes a todo el ancho con el titular encima.',
    slider: true,
    logo: ['izquierda', 'centro'],
    menu: ['superior', 'bajo_logo'],
  },
  {
    id: 'lateral',
    nombre: 'Menú lateral',
    descripcion: 'Menú fijo a la izquierda con el logo arriba. Sin carrusel.',
    slider: false,
    logo: ['lateral'],
    menu: ['lateral'],
  },
];

export const MAX_IMAGENES_SLIDER = 6;
export const COLOR_HEX = /^#[0-9a-fA-F]{6}$/;

export interface ConfiguracionSitio {
  plantilla: string;
  logo_posicion: PosicionLogo;
  menu_posicion: PosicionMenu;
  tipografia: { fuente_titulo: FuenteSitio; color_titulo: string; fuente_texto: FuenteSitio; color_texto: string };
  secciones: { clave: SeccionSitio; visible: boolean }[];
}

/** Equivale al aspecto que tenía la página antes del módulo (ink / body de la guía visual). */
export const CONFIGURACION_SITIO_INICIAL: ConfiguracionSitio = {
  plantilla: 'clasica',
  logo_posicion: 'izquierda',
  menu_posicion: 'superior',
  tipografia: { fuente_titulo: 'Plus Jakarta Sans', color_titulo: '#172235', fuente_texto: 'Plus Jakarta Sans', color_texto: '#3F4D61' },
  secciones: SECCIONES_SITIO.map((clave) => ({ clave, visible: true })),
};

export const plantillaDe = (id: string): PlantillaSitio | undefined => PLANTILLAS_SITIO.find((p) => p.id === id);
