/** Fotos que el colegio sube en Configuración institucional: `login` va en la pantalla de ingreso y `dashboard` en el tablero de docentes, estudiantes, etc. */
export const CLAVES_IMAGEN_INSTITUCIONAL = ['login', 'dashboard'] as const;
export type ClaveImagenInstitucional = (typeof CLAVES_IMAGEN_INSTITUCIONAL)[number];

export const MAX_BYTES_IMAGEN_INSTITUCIONAL = 2 * 1024 * 1024;
export const TIPOS_IMAGEN_INSTITUCIONAL = ['image/png', 'image/jpeg', 'image/webp'] as const;
