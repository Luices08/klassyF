/**
 * Perfil oculto de cada estudiante (la «matriz» del Excel `Analisis_Grados_Desempeno_Colombia_SGA.xlsx`): una categoría de
 * desempeño según su grado y variables latentes que después mueven sus notas, entregas y asistencia. Funciones puras.
 */
import { Azar } from '../nucleo/azar';
import { ConfigSimulacion } from '../configuracion';

/** Grupos de áreas que se correlacionan entre sí (las notas de un estudiante no son independientes por materia). */
export const FAMILIAS_AREA = ['MATEMATICAS', 'CIENCIAS', 'LENGUAJE', 'INGLES', 'SOCIALES', 'FORMATIVAS'] as const;
export type FamiliaArea = (typeof FAMILIAS_AREA)[number];

const CORRELACION_AREAS: number[][] = [
  [1, 0.7, 0.5, 0.5, 0.4, 0.2],
  [0.7, 1, 0.5, 0.4, 0.5, 0.2],
  [0.5, 0.5, 1, 0.6, 0.6, 0.3],
  [0.5, 0.4, 0.6, 1, 0.4, 0.2],
  [0.4, 0.5, 0.6, 0.4, 1, 0.3],
  [0.2, 0.2, 0.3, 0.2, 0.3, 1],
];

/** Factor de Cholesky (triangular inferior) de una matriz simétrica definida positiva. */
export function cholesky(m: number[][]): number[][] {
  const n = m.length;
  const l = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let suma = 0;
      for (let k = 0; k < j; k += 1) suma += (l[i]?.[k] ?? 0) * (l[j]?.[k] ?? 0);
      const valor = (m[i]?.[j] ?? 0) - suma;
      (l[i] as number[])[j] = i === j ? Math.sqrt(Math.max(valor, 1e-12)) : valor / (l[j]?.[j] ?? 1);
    }
  }
  return l;
}

const FACTOR_AREAS = cholesky(CORRELACION_AREAS);

export interface Latentes {
  habilidad: number;
  habilidad_area: Record<FamiliaArea, number>;
  constancia: number;
  asistencia_base: number;
  puntualidad: number;
  tendencia: number;
  volatilidad: number;
  riesgo_convivencia: number;
  riesgo_desercion: number;
}

export interface EstudianteGenerado {
  categoria: string;
  latentes: Latentes;
  /** Años por encima de la edad ideal del grado. */
  extraedad: number;
  repitente: boolean;
}

const acotar = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

/**
 * Reparte las categorías de un grado por resto mayor (la proporción del grado sale exacta, no «más o menos») y las baraja.
 */
export function categoriasDelGrado(config: ConfigSimulacion, grado: number, total: number, azar: Azar): string[] {
  const pesos = config.poblacion.por_grado[String(grado)];
  if (!pesos) throw new Error(`El grado ${grado} no tiene matriz de perfiles.`);
  const suma = pesos.reduce((s, p) => s + p, 0);
  const exactos = pesos.map((p) => (p / suma) * total);
  const cuentas = exactos.map(Math.floor);
  const restos = exactos.map((x, i) => ({ i, r: x - (cuentas[i] ?? 0) })).sort((a, b) => b.r - a.r);
  for (let k = 0; k < total - cuentas.reduce((s, c) => s + c, 0); k += 1) {
    const i = restos[k]?.i ?? 0;
    cuentas[i] = (cuentas[i] ?? 0) + 1;
  }
  const lista = config.poblacion.categorias.flatMap((c, i) => Array.from({ length: cuentas[i] ?? 0 }, () => c));
  return azar.barajar(lista);
}

export function generarEstudiante(config: ConfigSimulacion, grado: number, categoria: string, azar: Azar): EstudianteGenerado {
  const [media, desviacion] = config.poblacion.nota_por_categoria[categoria] ?? [3.4, 0.25];
  const habilidad = acotar(azar.normal(media, desviacion * 0.6), 1.2, 5);

  const z = FAMILIAS_AREA.map(() => azar.normal());
  const habilidad_area = Object.fromEntries(
    FAMILIAS_AREA.map((familia, i) => {
      const correlado = (FACTOR_AREAS[i] ?? []).reduce((s, coef, k) => s + coef * (z[k] ?? 0), 0);
      return [familia, acotar(habilidad + 0.3 * correlado, 1, 5)];
    })
  ) as Record<FamiliaArea, number>;

  // Constancia y asistencia van de la mano con la habilidad, pero con excepciones (el capaz que no entrega, el esforzado).
  const r = config.poblacion.correlacion_latentes;
  const habilidadNormalizada = (habilidad - 3.4) / 0.8;
  const mezcla = () => r * habilidadNormalizada + Math.sqrt(1 - r * r) * azar.normal();
  const constancia = acotar(0.75 + 0.15 * mezcla(), 0.15, 0.99);
  const asistencia_base = acotar(0.05 - 0.025 * mezcla(), 0.005, 0.3);
  const puntualidad = acotar(0.04 - 0.02 * mezcla(), 0.002, 0.25);

  const extraedad = edadExtra(config, grado, categoria, azar);
  const [, , , pctRepitentes] = config.poblacion.edad[String(grado)] ?? [0, 1, 0, 0];
  const repitente = grado > 0 && extraedad > 0 && azar.prob(Math.min(1, pctRepitentes / 0.3));

  const riesgo_desercion = acotar(0.1 + 0.15 * extraedad + 0.6 * asistencia_base + (categoria === 'BAJO' ? 0.15 : 0) + 0.05 * azar.normal(), 0, 1);
  return {
    categoria,
    extraedad,
    repitente,
    latentes: {
      habilidad,
      habilidad_area,
      constancia,
      asistencia_base,
      puntualidad,
      tendencia: acotar(azar.normal(0, 0.06), -0.15, 0.15),
      volatilidad: acotar(0.1 + azar.num() * 0.3, 0.1, 0.4),
      riesgo_convivencia: acotar(0.25 - 0.1 * habilidadNormalizada + 0.15 * azar.normal() + (grado >= 6 && grado <= 8 ? 0.1 : 0), 0, 1),
      riesgo_desercion,
    },
  };
}

/** Años de más según la hoja de extraedad; quien va en bajo tiene más probabilidad de ir atrasado. */
function edadExtra(config: ConfigSimulacion, grado: number, categoria: string, azar: Azar): number {
  const [, ideal, unoMas] = config.poblacion.edad[String(grado)] ?? [0, 1, 0, 0];
  const dosMas = Math.max(0, 1 - ideal - unoMas);
  const sesgo = categoria === 'BAJO' ? 1.8 : categoria === 'SUPERIOR' ? 0.5 : categoria === 'ALTO' ? 0.8 : 1;
  const i = azar.ponderado([ideal, unoMas * sesgo, dosMas * sesgo]);
  return i === 2 ? 2 + (azar.prob(0.25) ? 1 : 0) : i;
}

/**
 * Fecha de nacimiento para que el estudiante tenga `edad` años cumplidos al empezar el año lectivo (corte al 31 de marzo,
 * como el ingreso a Transición con 5 años cumplidos).
 */
export function fechaNacimiento(anioLectivo: number, edad: number, azar: Azar): Date {
  const desde = Date.UTC(anioLectivo - edad - 1, 3, 1);
  const hasta = Date.UTC(anioLectivo - edad, 2, 31);
  const dias = Math.floor((hasta - desde) / 86_400_000);
  return new Date(desde + azar.entero(0, dias) * 86_400_000);
}
