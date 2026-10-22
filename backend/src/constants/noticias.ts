import type { Rol } from './enums';

/**
 * Noticias y eventos institucionales: la feria de ciencias, la reunión de padres, el día de la Virgen… Es un módulo propio, aparte de los anuncios de M28 (que son
 * avisos cortos por perfil): una noticia tiene fecha, lugar, categoría y un alcance (institución, sedes, grados o grupos).
 */

/** A quiénes se dirige una noticia. El personal (administración, coordinación, secretaría, convivencia, orientación) ve lo de sus sedes sin que se le nombre. */
export const ROLES_DESTINO_NOTICIA = ['DOCENTE', 'ESTUDIANTE', 'ACUDIENTE'] as const satisfies readonly Rol[];
export type RolDestinoNoticia = (typeof ROLES_DESTINO_NOTICIA)[number];

/** Hasta dónde llega una noticia, de menor a mayor. Lo que se habilita a un docente es un máximo en esta escala. */
export const ALCANCES_NOTICIA = ['GRUPOS', 'GRADOS', 'SEDES', 'INSTITUCION'] as const;
export type AlcanceNoticia = (typeof ALCANCES_NOTICIA)[number];

export const ESTADOS_NOTICIA = ['PUBLICADA', 'ARCHIVADA'] as const;
export type EstadoNoticia = (typeof ESTADOS_NOTICIA)[number];

export const ESTADOS_HABILITACION = ['ACTIVA', 'REVOCADA'] as const;
export type EstadoHabilitacion = (typeof ESTADOS_HABILITACION)[number];

/** Los mismos 5 tonos de `Chip`: una categoría no inventa colores. */
export const TONOS_CATEGORIA = ['blue', 'green', 'orange', 'red', 'neutral'] as const;
export type TonoCategoria = (typeof TONOS_CATEGORIA)[number];

export const MAX_TITULO_NOTICIA = 120;
export const MAX_DESCRIPCION_NOTICIA = 4000;
export const MAX_LUGAR_NOTICIA = 120;
export const MAX_NOMBRE_CATEGORIA = 60;

/** Marca (en `Counter`) de que ya se sembraron las categorías de partida: lo que el colegio elimine no vuelve. */
export const MARCA_CATEGORIAS_SEMBRADAS = 'NOTICIAS_CATEGORIAS_SEMBRADAS';

/** Valores de partida del catálogo de categorías; desde ahí es del colegio (lo crea, edita, desactiva y elimina). */
export const CATEGORIAS_INICIALES: ReadonlyArray<{ nombre: string; tono: TonoCategoria }> = [
  { nombre: 'Académico', tono: 'blue' },
  { nombre: 'Cultural', tono: 'orange' },
  { nombre: 'Deportivo', tono: 'green' },
  { nombre: 'Ambiental', tono: 'green' },
  { nombre: 'Pastoral', tono: 'neutral' },
  { nombre: 'Reunión de padres', tono: 'blue' },
  { nombre: 'Administrativo', tono: 'neutral' },
];

/**
 * Tamaño de una noticia en el mosaico (cuadrícula de 4 columnas): Principal 2x2, Destacada 2x1 (horizontal), Estándar 1x2 (vertical) y Breve 1x1. El redactor elige qué tan
 * importante es la noticia; así las tarjetas del «periódico» no son todas iguales.
 */
export const TAMANOS_MOSAICO = ['PRINCIPAL', 'DESTACADA', 'ESTANDAR', 'BREVE'] as const;
export type TamanoMosaico = (typeof TAMANOS_MOSAICO)[number];
export const TAMANO_MOSAICO_POR_DEFECTO: TamanoMosaico = 'ESTANDAR';

export const MAX_SUBTITULO_NOTICIA = 200;

/** Cuánto puede pesar el cuerpo con formato (las imágenes del cuerpo viajan dentro del texto, como en las actividades) y la portada como data URI (2 MB de imagen en base64). */
export const MAX_CARACTERES_CONTENIDO_NOTICIA = 4_500_000;
export const MAX_CARACTERES_PORTADA = 3_000_000;

/** La imagen de una noticia (afiche, foto del evento): una por noticia, PNG, JPG o WEBP confirmado por la firma de bytes. Toda noticia nueva lleva una. */
export const MAX_BYTES_IMAGEN_NOTICIA = 2 * 1024 * 1024;
export const TIPOS_IMAGEN_NOTICIA = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Cada cuánto se revisa si hay noticias programadas que ya les llegó la hora de publicarse (y, con ello, avisar a sus destinatarios). */
export const REVISION_NOTICIAS_PROGRAMADAS_MS = 60 * 1000;

/** Todas las noticias nuevas de un destinatario se agrupan en una sola alerta de la campanita (como M28 agrupa las entregas): «Hay 3 noticias nuevas». */
export const ENTIDAD_AVISO_NOTICIAS = 'noticias-nuevas';
