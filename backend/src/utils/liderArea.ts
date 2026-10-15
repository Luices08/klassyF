import { NIVELES_EDUCATIVOS, NivelEducativo } from '../constants/enums';
import {
  AlcanceJornada,
  EstadoPlanVista,
  NOMBRES_NIVEL_EDUCATIVO,
  NOMBRES_TIPO_JORNADA,
  TIPOS_JORNADA,
  TipoJornada,
} from '../constants/planeacion';

/**
 * Funciones puras de los líderes de área (M07). Un líder responde por una parte de la institución —su alcance— y no por toda el
 * área: niveles educativos (vacío = todos), diurna o nocturna (o todas) y sedes (vacío = todas). Sin Mongoose, con pruebas.
 */

export interface AlcanceLider {
  niveles: readonly NivelEducativo[];
  jornada: AlcanceJornada;
  sedes_ids: readonly string[];
}

/** Un pedazo de la institución donde el área se dicta: nivel + tipo de jornada + sede. `null` = no se sabe (aún no hay grupos). */
export interface Rebanada {
  nivel: NivelEducativo;
  jornada: TipoJornada | null;
  sede_id: string | null;
}

const nivelesDe = (a: AlcanceLider): readonly NivelEducativo[] => (a.niveles.length > 0 ? a.niveles : NIVELES_EDUCATIVOS);
const tiposDe = (a: AlcanceLider): readonly TipoJornada[] => (a.jornada === 'TODAS' ? TIPOS_JORNADA : [a.jornada]);

/** ¿Este líder responde por ese pedazo de la institución? */
export function alcanceCubre(alcance: AlcanceLider, rebanada: Rebanada): boolean {
  if (!nivelesDe(alcance).includes(rebanada.nivel)) return false;
  if (rebanada.jornada !== null && !tiposDe(alcance).includes(rebanada.jornada)) return false;
  if (rebanada.sede_id !== null && alcance.sedes_ids.length > 0 && !alcance.sedes_ids.includes(rebanada.sede_id)) return false;
  return true;
}

/** Dos líderes del mismo área no pueden cubrir lo mismo: no se sabría de quién es el plan de área de ese pedazo. */
export function alcancesSeSolapan(a: AlcanceLider, b: AlcanceLider): boolean {
  const comparten = <T>(x: readonly T[], y: readonly T[]) => x.some((v) => y.includes(v));
  if (!comparten(nivelesDe(a), nivelesDe(b))) return false;
  if (!comparten(tiposDe(a), tiposDe(b))) return false;
  if (a.sedes_ids.length === 0 || b.sedes_ids.length === 0) return true;
  return comparten(a.sedes_ids, b.sedes_ids);
}

const ordenDeNivel = (n: NivelEducativo) => NIVELES_EDUCATIVOS.indexOf(n);

const textoDeNiveles = (niveles: readonly NivelEducativo[]): string => {
  const ordenados = [...new Set(niveles)].sort((x, y) => ordenDeNivel(x) - ordenDeNivel(y));
  return ordenados.length === 0 || ordenados.length === NIVELES_EDUCATIVOS.length ? 'Todos los niveles' : ordenados.map((n) => NOMBRES_NIVEL_EDUCATIVO[n]).join(', ');
};

const textoDeJornada = (jornada: AlcanceJornada): string => (jornada === 'TODAS' ? 'Todas las jornadas' : NOMBRES_TIPO_JORNADA[jornada]);

/** «Primaria, Secundaria · Diurna · Todas las sedes»: lo que ve una persona para saber de qué es líder alguien. */
export function textoDeAlcance(alcance: AlcanceLider, nombresDeSedes: ReadonlyMap<string, string> = new Map()): string {
  const sedes =
    alcance.sedes_ids.length === 0
      ? 'Todas las sedes'
      : alcance.sedes_ids.map((id) => nombresDeSedes.get(id) ?? 'Sede').join(', ');
  return [textoDeNiveles(alcance.niveles), textoDeJornada(alcance.jornada), sedes].join(' · ');
}

/** Lo que ningún líder cubre de lo que el área necesita. */
export function rebanadasSinCubrir(demandadas: readonly Rebanada[], alcances: readonly AlcanceLider[]): Rebanada[] {
  return demandadas.filter((r) => !alcances.some((a) => alcanceCubre(a, r)));
}

/**
 * Describe pedazos sin líder para un aviso: agrupa los niveles que comparten jornada (y sede, solo si la institución tiene varias):
 * «Secundaria, Media · Diurna». Sin jornada conocida se omite ese dato.
 */
export function textoDeRebanadas(rebanadas: readonly Rebanada[], nombresDeSedes: ReadonlyMap<string, string> = new Map(), variasSedes = false): string[] {
  const grupos = new Map<string, { niveles: NivelEducativo[]; jornada: TipoJornada | null; sede_id: string | null }>();
  for (const r of rebanadas) {
    const sede = variasSedes ? r.sede_id : null;
    const clave = `${r.jornada ?? '-'}|${sede ?? '-'}`;
    const previo = grupos.get(clave);
    if (previo) previo.niveles.push(r.nivel);
    else grupos.set(clave, { niveles: [r.nivel], jornada: r.jornada, sede_id: sede });
  }
  return [...grupos.values()].map((g) =>
    [
      textoDeNiveles(g.niveles.length === NIVELES_EDUCATIVOS.length ? [] : g.niveles),
      g.jornada ? NOMBRES_TIPO_JORNADA[g.jornada] : null,
      g.sede_id ? (nombresDeSedes.get(g.sede_id) ?? 'Sede') : null,
    ]
      .filter(Boolean)
      .join(' · ')
  );
}

// --- El plan de área que le corresponde a una clase ---

export interface CoberturaConPlan {
  _id: string;
  alcance: AlcanceLider;
  estado: EstadoPlanVista;
  plan_id: string | null;
}

export interface PlanAreaDeClase {
  /** APROBADO solo si cada pedazo donde se dicta tiene líder y su plan está aprobado; si no, el estado más atrasado. */
  estado: EstadoPlanVista;
  /** Los planes de área aprobados que aplican a la clase (casi siempre uno). */
  planes_aprobados_ids: string[];
  /** Por qué no está aprobado cuando falta un líder; null en los demás casos. */
  detalle: string | null;
}

const PRIORIDAD_PENDIENTE: Record<EstadoPlanVista, number> = { APROBADO: 0, EN_REVISION: 1, DEVUELTO: 2, SIN_CARGAR: 3 };

/**
 * El plan de área que aplica a una clase del grado de ese nivel, dictada en esos grupos (cada uno con su jornada y sede). Una clase
 * puede tocar más de un líder (p. ej. un grupo diurno y uno nocturno); solo está habilitada si todos tienen su plan aprobado.
 */
export function planAreaDeClase(coberturas: readonly CoberturaConPlan[], nivel: NivelEducativo, grupos: ReadonlyArray<{ jornada: TipoJornada; sede_id: string }>): PlanAreaDeClase {
  const rebanadas: Rebanada[] = grupos.length > 0 ? grupos.map((g) => ({ nivel, jornada: g.jornada, sede_id: g.sede_id })) : [{ nivel, jornada: null, sede_id: null }];

  const aplican = new Map<string, CoberturaConPlan>();
  const sinLider: Rebanada[] = [];
  for (const r of rebanadas) {
    const cobertura = coberturas.find((c) => alcanceCubre(c.alcance, r));
    if (cobertura) aplican.set(cobertura._id, cobertura);
    else sinLider.push(r);
  }

  const estados = [...aplican.values()].map((c) => c.estado);
  const peor = estados.reduce<EstadoPlanVista>((acc, e) => (PRIORIDAD_PENDIENTE[e] > PRIORIDAD_PENDIENTE[acc] ? e : acc), 'APROBADO');
  const estado: EstadoPlanVista = sinLider.length > 0 ? 'SIN_CARGAR' : peor;
  return {
    estado,
    planes_aprobados_ids: [...aplican.values()].flatMap((c) => (c.estado === 'APROBADO' && c.plan_id ? [c.plan_id] : [])),
    detalle: sinLider.length > 0 ? `no tiene líder de área para ${textoDeRebanadas(sinLider).join('; ')}` : null,
  };
}
