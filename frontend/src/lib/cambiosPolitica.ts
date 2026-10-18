import type { PoliticaPromocion } from '../hooks/usePromocion';
import { type NombresCatalogo, resumenPolitica } from './resumenPolitica';

const claves = (p: PoliticaPromocion) => JSON.stringify([p.unidad, p.area_pierde_con_asignatura_perdida, p.asignaturas_criticas_ids, p.areas_criticas_ids, p.asignaturas_arrastrables_ids, p.areas_arrastrables_ids, p.inasistencia, p.umbrales, p.imprescindibles, p.piar, p.arrastre, p.sin_regla, p.reglas, p.titulacion, p.texto_siee]);

export const hayCambios = (antes: PoliticaPromocion, despues: PoliticaPromocion): boolean => claves(antes) !== claves(despues);

/**
 * Qué frases del SIEE se agregan o se quitan al guardar, en el mismo lenguaje del resumen. Lo que no tiene frase (reglas propias, titulación,
 * texto oficial) se avisa aparte.
 */
export function describirCambios(antes: PoliticaPromocion, despues: PoliticaPromocion, nota: number, nombres: NombresCatalogo): { quitan: string[]; agregan: string[]; otros: string[] } {
  const a = resumenPolitica(antes, nota, nombres);
  const d = resumenPolitica(despues, nota, nombres);
  const otros: string[] = [];
  if (JSON.stringify(antes.reglas) !== JSON.stringify(despues.reglas)) otros.push('Cambiaron las reglas especiales del colegio.');
  if (JSON.stringify(antes.titulacion) !== JSON.stringify(despues.titulacion)) otros.push('Cambiaron los requisitos de grado y título.');
  if (antes.texto_siee !== despues.texto_siee) otros.push('Cambió el texto oficial del SIEE.');
  return { quitan: a.filter((f) => !d.includes(f)), agregan: d.filter((f) => !a.includes(f)), otros };
}
