// Retiro y traslado de un estudiante durante el año lectivo (M04 → M11, M13, M17, M26, M31).

/**
 * Por qué deja de asistir. Ambos terminan la matrícula en el estado `RETIRADO` (el único que ya filtran las listas vivas del aula,
 * el cupo y el Libro de Matrícula): lo que los distingue es un dato de la salida, no otro estado que obligue a tocar cada filtro.
 *  - RETIRO: se va por decisión de la familia, desescolarización, fallecimiento, etc.
 *  - TRASLADO: sigue estudiando en otra institución (esa institución receptora es obligatoria).
 */
export const TIPOS_SALIDA = ['RETIRO', 'TRASLADO'] as const;
export type TipoSalida = (typeof TIPOS_SALIDA)[number];

export const NOMBRES_TIPO_SALIDA: Record<TipoSalida, string> = {
  RETIRO: 'Retiro',
  TRASLADO: 'Traslado a otra institución',
};

/**
 * Cuándo se libera el cupo del grupo (decisión del colegio, Configuración institucional):
 *  - INMEDIATA: al registrar la salida (por defecto, como siempre se hizo).
 *  - AL_APROBAR_PAZ_Y_SALVO: el cupo sigue ocupado hasta que el paz y salvo de salida quede aprobado.
 * Sea cual sea, el estudiante deja de aparecer de inmediato en las listas del aula: el cupo es un conteo, no una lista.
 */
export const POLITICAS_CUPO_SALIDA = ['INMEDIATA', 'AL_APROBAR_PAZ_Y_SALVO'] as const;
export type PoliticaCupoSalida = (typeof POLITICAS_CUPO_SALIDA)[number];

export const NOMBRES_POLITICA_CUPO_SALIDA: Record<PoliticaCupoSalida, string> = {
  INMEDIATA: 'Liberar el cupo al registrar la salida',
  AL_APROBAR_PAZ_Y_SALVO: 'Liberar el cupo cuando el paz y salvo de salida esté aprobado',
};

/** Estado de cada dependencia del paz y salvo de salida y, derivado de ellas, el del paz y salvo completo. */
export const ESTADOS_PAZ_Y_SALVO_SALIDA = ['PENDIENTE', 'BLOQUEADO', 'APROBADO'] as const;
export type EstadoPazYSalvoSalida = (typeof ESTADOS_PAZ_Y_SALVO_SALIDA)[number];

export const NOMBRES_ESTADO_PAZ_Y_SALVO_SALIDA: Record<EstadoPazYSalvoSalida, string> = {
  PENDIENTE: 'Pendiente',
  BLOQUEADO: 'Bloqueado por deuda o material',
  APROBADO: 'Aprobado',
};

/** Qué pasó con una dependencia: cada cambio queda en su historial y nada se sobrescribe sin rastro. */
export const ACCIONES_PAZ_Y_SALVO_SALIDA = ['APERTURA', 'APROBACION', 'BLOQUEO', 'EXCEPCION', 'ANULACION'] as const;
export type AccionPazYSalvoSalida = (typeof ACCIONES_PAZ_Y_SALVO_SALIDA)[number];

export const MIN_LONGITUD_MOTIVO_SALIDA = 5;
export const MAX_LONGITUD_MOTIVO_SALIDA = 500;
export const MAX_LONGITUD_OBSERVACION_SALIDA = 1000;
export const MAX_SOPORTES_SALIDA = 5;
export const MAX_BYTES_SOPORTE_SALIDA = 5 * 1024 * 1024;
