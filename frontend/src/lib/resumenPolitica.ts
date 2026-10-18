import type { PoliticaPromocion } from '../hooks/usePromocion';

export interface NombresCatalogo {
  asignaturas: Map<string, string>;
  areas: Map<string, string>;
}

const listar = (nombres: string[]): string => (nombres.length <= 1 ? (nombres[0] ?? '') : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const nota = (n: number) => n.toFixed(1);

/** Cuántas materias se pueden perder y aun así tener oportunidad; null si el colegio aún no lo definió aquí. */
export const topeDeRecuperacion = (p: PoliticaPromocion): number | null => p.umbrales.recuperacion_hasta;

/** Lo que dice el colegio en lenguaje de colegio, frase por frase. Lo usa el panel «Así queda tu SIEE» y la confirmación al guardar. */
export function resumenPolitica(p: PoliticaPromocion, notaAprobatoria: number, nombres: NombresCatalogo): string[] {
  const frases: string[] = [];
  const unidad = p.unidad === 'AREA' ? 'áreas' : 'materias';
  const unidadUna = p.unidad === 'AREA' ? 'área' : 'materia';

  frases.push(
    p.unidad === 'ASIGNATURA'
      ? 'Se evalúa materia por materia.'
      : p.unidad === 'AREA'
        ? 'Se evalúa por áreas: se promedian las materias de cada área.'
        : 'Se cuentan materias y áreas perdidas.'
  );
  if (p.unidad !== 'ASIGNATURA' && p.area_pierde_con_asignatura_perdida) frases.push('Un área se da por perdida si se pierde una de sus materias.');
  frases.push(`Se pierde una ${unidadUna} con nota menor de ${nota(notaAprobatoria)}.`);

  const hasta = topeDeRecuperacion(p);
  frases.push('Si aprueba todo, es promovido.');
  if (hasta === null) {
    frases.push('La recuperación de fin de año se rige por lo que diga el módulo de Recuperaciones.');
  } else if (hasta === 0) {
    frases.push(`No hay recuperación de fin de año: con 1 o más ${unidad} perdidas no es promovido.`);
  } else {
    frases.push(`Con ${hasta === 1 ? '1' : `1 a ${hasta}`} ${unidad} perdidas presenta recuperación de fin de año; ${p.umbrales.efecto_nota_recuperacion === 'LIMITA_A_APROBATORIA' ? `si la aprueba, su nota queda en ${nota(notaAprobatoria)}` : 'si la aprueba, queda con la nota que saque'}.`);
    frases.push(`Con ${hasta + 1} o más ${unidad} perdidas no es promovido.`);
  }
  if (p.unidad === 'AMBAS' && p.umbrales.reprueba_desde_areas !== null) frases.push(`También reprueba el año si pierde ${p.umbrales.reprueba_desde_areas} o más áreas.`);

  if (p.inasistencia.activa) {
    frases.push(`Pierde el año quien falte a más del ${p.inasistencia.porcentaje} % de las clases${p.inasistencia.faltas === 'SOLO_INJUSTIFICADAS' ? ' sin justificar' : ' (justificadas o no)'}.`);
  }

  const imprescindibles = [
    ...(p.unidad !== 'AREA' ? p.asignaturas_criticas_ids.map((id) => nombres.asignaturas.get(id) ?? '') : []),
    ...(p.unidad !== 'ASIGNATURA' ? p.areas_criticas_ids.map((id) => nombres.areas.get(id) ?? '') : []),
  ].filter(Boolean);
  if (imprescindibles.length > 0 && p.imprescindibles.efecto) {
    const efecto = p.imprescindibles.efecto === 'NO_PROMUEVE' ? 'pierde el año directamente' : p.imprescindibles.efecto === 'COMISION' ? 'su caso lo decide la Comisión' : 'va a recuperación como las demás';
    frases.push(`Si pierde ${listar(imprescindibles)} (imprescindibles), ${efecto}.`);
  }

  if (p.piar.derivar_a_comision) frases.push('Si un estudiante con PIAR reprueba, no se aplica la regla automática: la Comisión decide en acta.');

  if (p.arrastre.admite) {
    const cuales = p.asignaturas_arrastrables_ids.map((id) => nombres.asignaturas.get(id) ?? '').filter(Boolean);
    frases.push(`Puede pasar de grado debiendo hasta ${plural(p.arrastre.max_unidades, 'materia', 'materias')}${cuales.length > 0 ? ` (solo ${listar(cuales)})` : ''}.`);
  }
  return frases;
}
