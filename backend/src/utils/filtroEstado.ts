/**
 * Filtro de consulta para "activo". Los documentos creados antes de que existiera el campo `estado` no lo tienen
 * guardado: Mongoose los lee como 'activo' (valor por defecto del schema), pero `{ estado: 'activo' }` en la consulta
 * los excluiria y desapareceria, p. ej., la mitad del catalogo de grados. Aqui "activo" es "todo lo que no es inactivo".
 */
export const ESTADO_ACTIVO = { $ne: 'inactivo' } as const;

/** 'activo' -> ESTADO_ACTIVO; 'inactivo' (u otro valor) -> tal cual. */
export function filtroPorEstado<T extends string>(estado: T): T | typeof ESTADO_ACTIVO {
  return estado === 'activo' ? ESTADO_ACTIVO : estado;
}
