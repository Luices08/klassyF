import { EstructuraSemana } from './tipos';

/**
 * Largo de cada tramo de clase seguida de la semana. Un día se corta donde hay un descanso y en las franjas que
 * `bloqueadas` (claves `diaISO-periodo`) marca como no usables; un bloque de varias horas debe quedar entero en uno de ellos.
 */
export function tramosDeSemana(estructura: EstructuraSemana, bloqueadas?: ReadonlySet<string>): number[] {
  const tramos: number[] = [];
  for (const dia of estructura.dias) {
    let racha = 0;
    estructura.periodos.forEach((periodo, i) => {
      if (periodo.descanso_antes && racha > 0) {
        tramos.push(racha);
        racha = 0;
      }
      if (bloqueadas?.has(`${dia}-${i}`)) {
        if (racha > 0) tramos.push(racha);
        racha = 0;
        return;
      }
      racha += 1;
    });
    if (racha > 0) tramos.push(racha);
  }
  return tramos;
}

/**
 * Acomoda bloques de varias horas en los tramos de la semana (de mayor a menor, cada uno en el tramo más justo). El que no
 * cabe entero se parte por la mitad y cada pedazo se vuelve a intentar: se parte antes que montarse sobre un descanso.
 * Los de una hora pasan sin tocarse. Es puro y no mira el resultado de ninguna generación, por eso se puede repetir al
 * publicar o editar y dar siempre los mismos bloques.
 */
export function ajustarBloquesATramos<T extends { tamano: number }>(bloques: readonly T[], tramos: readonly number[]): T[] {
  const restos = [...tramos];
  const resultado = bloques.filter((b) => b.tamano <= 1);
  const cola = bloques.filter((b) => b.tamano > 1).sort((a, b) => b.tamano - a.tamano);

  while (cola.length > 0) {
    const bloque = cola.shift()!;
    let mejor = -1;
    restos.forEach((resto, i) => {
      if (resto >= bloque.tamano && (mejor < 0 || resto < restos[mejor]!)) mejor = i;
    });
    if (mejor >= 0) {
      restos[mejor]! -= bloque.tamano;
      resultado.push(bloque);
      continue;
    }
    const mayor = Math.ceil(bloque.tamano / 2);
    for (const tamano of [mayor, bloque.tamano - mayor]) {
      const pedazo = { ...bloque, tamano };
      if (tamano <= 1) {
        resultado.push(pedazo);
        continue;
      }
      const lugar = cola.findIndex((x) => x.tamano < tamano);
      cola.splice(lugar < 0 ? cola.length : lugar, 0, pedazo);
    }
  }
  return resultado;
}
