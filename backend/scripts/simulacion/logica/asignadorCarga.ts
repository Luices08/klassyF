/**
 * Reparte la carga académica entre los docentes de la configuración. Función pura (sin base de datos), con pruebas.
 *
 * - Un titular (primaria, Transición) se queda con un grupo entero: todas las asignaturas que puede dictar en él, y lo dirige.
 * - El resto se reparte por «paquetes» indivisibles (grupo, asignatura, horas) con búsqueda con retroceso: cada docente
 *   termina entre `horas_min` y `horas_max`, y se prefiere que un mismo docente dicte la asignatura en todos los grupos del grado.
 * - Si no hay reparto posible, falla diciendo qué docente no cierra: no inventa horas.
 */
import { PlazaDocente } from '../configuracion';

export interface GrupoCarga {
  clave: string;
  grado: number;
  sede: string;
}

export interface Paquete {
  grupo: string;
  grado: number;
  sede: string;
  asignatura: string;
  horas: number;
}

export interface ResultadoCarga {
  asignaciones: Array<{ grupo: string; asignatura: string; docente: string; horas: number }>;
  directores: Map<string, string>;
  horas: Map<string, number>;
}

const MAX_NODOS = 2_000_000;

function puedeDictar(plaza: PlazaDocente, p: Paquete): boolean {
  return plaza.sede === p.sede && plaza.puede.some((r) => r.asignaturas.includes(p.asignatura) && (!r.grados || r.grados.includes(p.grado)));
}

export function asignarCarga(
  grupos: readonly GrupoCarga[],
  planDe: (grado: number) => Record<string, number>,
  plazas: readonly PlazaDocente[],
  horasMin: number,
  horasMax: number
): ResultadoCarga {
  const ordenGrupos = [...grupos].sort((a, b) => a.grado - b.grado || a.clave.localeCompare(b.clave));
  const paquetes: Paquete[] = ordenGrupos.flatMap((g) =>
    Object.entries(planDe(g.grado)).map(([asignatura, horas]) => ({ grupo: g.clave, grado: g.grado, sede: g.sede, asignatura, horas }))
  );

  const horas = new Map(plazas.map((p) => [p.clave, 0]));
  const docenteDe = new Map<Paquete, string>();
  const directores = new Map<string, string>();

  // 1. Titulares: un grupo cada uno, en orden.
  for (const titular of plazas.filter((p) => p.titular)) {
    const grupo = ordenGrupos.find((g) => !directores.has(g.clave) && paquetes.some((p) => p.grupo === g.clave && puedeDictar(titular, p)));
    if (!grupo) throw new Error(`El titular ${titular.clave} no encontró un grupo libre que pueda dirigir.`);
    directores.set(grupo.clave, titular.clave);
    for (const p of paquetes.filter((x) => x.grupo === grupo.clave && puedeDictar(titular, x))) {
      docenteDe.set(p, titular.clave);
      horas.set(titular.clave, (horas.get(titular.clave) ?? 0) + p.horas);
    }
  }

  // 2. El resto, con retroceso.
  const libres = plazas.filter((p) => !p.titular);
  const pendientes = paquetes.filter((p) => !docenteDe.has(p));
  const candidatos = new Map(pendientes.map((p) => [p, libres.filter((d) => puedeDictar(d, p)).map((d) => d.clave)]));
  const sinDocente = pendientes.filter((p) => (candidatos.get(p) ?? []).length === 0);
  if (sinDocente.length > 0) {
    throw new Error(`Nadie puede dictar: ${sinDocente.map((p) => `${p.asignatura} en ${p.grupo}`).join(', ')}. Revisa «puede» de los docentes.`);
  }
  pendientes.sort(
    (a, b) =>
      (candidatos.get(a)?.length ?? 0) - (candidatos.get(b)?.length ?? 0) ||
      b.horas - a.horas ||
      a.asignatura.localeCompare(b.asignatura) ||
      a.grado - b.grado ||
      a.grupo.localeCompare(b.grupo)
  );

  const dicta = new Set<string>(); // «docente|asignatura|grado» y «docente|asignatura»
  const marcar = (d: string, p: Paquete, delta: 1 | -1) => {
    horas.set(d, (horas.get(d) ?? 0) + delta * p.horas);
    const k1 = `${d}|${p.asignatura}|${p.grado}`;
    const k2 = `${d}|${p.asignatura}`;
    if (delta === 1) {
      dicta.add(k1);
      dicta.add(k2);
    } else {
      const sigue = (k: (q: Paquete) => boolean) => pendientes.some((q) => q !== p && docenteDe.get(q) === d && k(q));
      if (!sigue((q) => q.asignatura === p.asignatura && q.grado === p.grado)) dicta.delete(k1);
      if (!sigue((q) => q.asignatura === p.asignatura)) dicta.delete(k2);
    }
  };

  // ¿Cada docente aún puede llegar al mínimo con lo que queda por repartir?
  const alcanzable = (desde: number): boolean => {
    for (const d of libres) {
      const actual = horas.get(d.clave) ?? 0;
      if (actual >= horasMin) continue;
      let posible = actual;
      for (let i = desde; i < pendientes.length && posible < horasMin; i += 1) {
        const p = pendientes[i] as Paquete;
        if ((candidatos.get(p) ?? []).includes(d.clave)) posible += p.horas;
      }
      if (posible < horasMin) return false;
    }
    return true;
  };

  let nodos = 0;
  const resolver = (i: number): boolean => {
    nodos += 1;
    if (nodos > MAX_NODOS) throw new Error('El reparto de carga no converge (demasiadas combinaciones). Revisa horas y docentes.');
    if (i === pendientes.length) return libres.every((d) => (horas.get(d.clave) ?? 0) >= horasMin);
    if (!alcanzable(i)) return false;
    const p = pendientes[i] as Paquete;
    const orden = [...(candidatos.get(p) ?? [])].sort((a, b) => {
      const puntaje = (d: string) => (dicta.has(`${d}|${p.asignatura}|${p.grado}`) ? 0 : dicta.has(`${d}|${p.asignatura}`) ? 1 : 2);
      return puntaje(a) - puntaje(b) || (horas.get(a) ?? 0) - (horas.get(b) ?? 0) || a.localeCompare(b);
    });
    for (const d of orden) {
      if ((horas.get(d) ?? 0) + p.horas > horasMax) continue;
      docenteDe.set(p, d);
      marcar(d, p, 1);
      if (resolver(i + 1)) return true;
      marcar(d, p, -1);
      docenteDe.delete(p);
    }
    return false;
  };

  if (!resolver(0)) {
    const resumen = libres.map((d) => {
      const posibles = pendientes.filter((p) => (candidatos.get(p) ?? []).includes(d.clave)).reduce((s, p) => s + p.horas, 0);
      return `${d.clave} (podría dictar ${posibles} h)`;
    });
    throw new Error(`No hay un reparto con todos los docentes entre ${horasMin} y ${horasMax} h. Docentes: ${resumen.join(', ')}.`);
  }

  const fuera = plazas.filter((d) => {
    const h = horas.get(d.clave) ?? 0;
    return h < horasMin || h > horasMax;
  });
  if (fuera.length > 0) {
    throw new Error(`Docentes fuera del rango ${horasMin}–${horasMax} h: ${fuera.map((d) => `${d.clave} = ${horas.get(d.clave)} h`).join(', ')}.`);
  }

  // 3. Directores de los grupos sin titular: quien más horas dicta en el grupo y aún no dirige otro.
  for (const g of ordenGrupos) {
    if (directores.has(g.clave)) continue;
    const horasEnGrupo = new Map<string, number>();
    for (const p of paquetes) if (p.grupo === g.clave) horasEnGrupo.set(docenteDe.get(p) as string, (horasEnGrupo.get(docenteDe.get(p) as string) ?? 0) + p.horas);
    const yaDirigen = new Set(directores.values());
    const elegido = [...horasEnGrupo.entries()].filter(([d]) => !yaDirigen.has(d)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (!elegido) throw new Error(`No queda un docente libre para dirigir el grupo ${g.clave}.`);
    directores.set(g.clave, elegido[0]);
  }

  return {
    asignaciones: paquetes.map((p) => ({ grupo: p.grupo, asignatura: p.asignatura, docente: docenteDe.get(p) as string, horas: p.horas })),
    directores,
    horas,
  };
}
