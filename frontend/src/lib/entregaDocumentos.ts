import type { DocumentoPrevisto } from '../hooks/useEnrollments';

/**
 * Lo que secretaría marca al formalizar una matrícula: los documentos que el acudiente trajo en físico. De ahí sale solo el estado (definitiva si no
 * falta ningún obligatorio, condicional con acta si falta alguno); el servidor decide igual, esto solo lo adelanta en pantalla.
 */

/** Los obligatorios que todavía no se marcaron como entregados. Lo que ya cubre el paz y salvo confirmado del año anterior no cuenta: lo aprueba el sistema. */
export function obligatoriosSinEntregar(previstos: readonly DocumentoPrevisto[], entregados: readonly string[]): DocumentoPrevisto[] {
  return previstos.filter((d) => d.obligatorio && !d.ya_cubierto && !entregados.includes(d.tipo_documento));
}

/** Solo las marcas que siguen siendo documentos de esa matrícula: al cambiar de grupo o de tipo de ingreso la lista cambia y una marca vieja ya no aplica. */
export function entregadosVigentes(previstos: readonly DocumentoPrevisto[], entregados: readonly string[]): string[] {
  const claves = new Set(previstos.filter((d) => !d.ya_cubierto).map((d) => d.tipo_documento));
  return entregados.filter((clave) => claves.has(clave));
}
