/**
 * Azar reproducible. Cada entidad saca su propio generador de una subsemilla (`azarPara(semilla, '2024', 'est', id)`): así,
 * cambiar cuántas actividades tiene una materia no cambia la asistencia de nadie, y con la misma semilla todo sale igual.
 */

/** Hash de 32 bits (FNV-1a) de las claves que forman la subsemilla. */
function hash(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Azar {
  private estado: number;

  constructor(semilla: number) {
    this.estado = semilla >>> 0;
  }

  /** mulberry32: uniforme en [0, 1). */
  num(): number {
    this.estado = (this.estado + 0x6d2b79f5) >>> 0;
    let t = this.estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Entero uniforme en [min, max], ambos incluidos. */
  entero(min: number, max: number): number {
    return min + Math.floor(this.num() * (max - min + 1));
  }

  prob(p: number): boolean {
    return this.num() < p;
  }

  elegir<T>(lista: readonly T[]): T {
    if (lista.length === 0) throw new Error('No se puede elegir de una lista vacía.');
    return lista[Math.floor(this.num() * lista.length)] as T;
  }

  /** Normal por Box-Muller. */
  normal(media = 0, desviacion = 1): number {
    const u = Math.max(this.num(), Number.EPSILON);
    const v = this.num();
    return media + desviacion * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Índice elegido según pesos (no necesitan sumar 1). */
  ponderado(pesos: readonly number[]): number {
    const total = pesos.reduce((s, p) => s + p, 0);
    let r = this.num() * total;
    for (let i = 0; i < pesos.length; i += 1) {
      r -= pesos[i] ?? 0;
      if (r < 0) return i;
    }
    return pesos.length - 1;
  }

  barajar<T>(lista: readonly T[]): T[] {
    const copia = [...lista];
    for (let i = copia.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.num() * (i + 1));
      [copia[i], copia[j]] = [copia[j] as T, copia[i] as T];
    }
    return copia;
  }
}

export function azarPara(semilla: number, ...claves: Array<string | number>): Azar {
  return new Azar(hash(`${semilla}|${claves.join('|')}`));
}
