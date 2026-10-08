import { resolverVariables } from './alcance';
import { EstadoHorario, PESO_DURO } from './evaluacion';
import { Aviso, EntradaMotor, Incidencia, Posicion, UbicacionFija, VariableDeTipo } from './tipos';

export interface OpcionesGeneracion {
  /** Misma semilla + mismos insumos = mismo horario (reproducible para soporte). */
  semilla?: number;
  tiempo_max_ms?: number;
  iteraciones_max?: number;
}

export interface UbicacionSesion extends UbicacionFija {
  sesion_id: string;
  espacio_id: string | null;
}

export interface ResultadoMotor {
  ubicaciones: UbicacionSesion[];
  conflictos_duros: number;
  penalizacion_blanda: number;
  incidencias: Incidencia[];
  avisos: Aviso[];
  estadisticas: { iteraciones: number; duracion_ms: number; semilla: number };
}

interface Unidad {
  sesiones: number[];
  /** Posición codificada como dia * nPeriodos + periodo. */
  dominio: number[];
  fija: Posicion | null;
}

/** Generador pseudoaleatorio con semilla (mulberry32): reproducible y sin dependencias. */
function crearAleatorio(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function aIndiceDia(entrada: EntradaMotor, fija: UbicacionFija): Posicion | null {
  const dia = entrada.estructura.dias.indexOf(fija.dia);
  return dia < 0 ? null : { dia, periodo: fija.periodo };
}

/** Une en una unidad las sesiones que deben empezar a la vez (SIMULTANEAS): la k-ésima de cada grupo. */
function construirUnidades(entrada: EntradaMotor, estado: EstadoHorario, avisos: Aviso[]): Unidad[] {
  const n = entrada.sesiones.length;
  const padre = Array.from({ length: n }, (_, i) => i);
  const raiz = (i: number): number => (padre[i] === i ? i : (padre[i] = raiz(padre[i]!)));
  const unir = (a: number, b: number) => {
    padre[raiz(a)] = raiz(b);
  };

  const vigentes = entrada.sesiones.map((s) => resolverVariables(entrada.variables, s));
  const simultaneas = entrada.variables.filter((v): v is VariableDeTipo<'SIMULTANEAS'> => v.tipo === 'SIMULTANEAS' && !v.es_excepcion);
  for (const v of simultaneas) {
    const porGrupo = new Map<string, number[]>();
    vigentes.forEach((vs, i) => {
      const g = entrada.sesiones[i]!.group_id;
      if (g && vs.some((x) => x.id === v.id)) porGrupo.set(g, [...(porGrupo.get(g) ?? []), i]);
    });
    const listas = [...porGrupo.values()].map((l) =>
      l.sort((a, b) => {
        const sa = entrada.sesiones[a]!;
        const sb = entrada.sesiones[b]!;
        return sb.duracion - sa.duracion || (sa.subject_id ?? '').localeCompare(sb.subject_id ?? '') || sa.indice - sb.indice;
      })
    );
    if (listas.length < 2) continue;
    const forma = (l: number[]) => l.map((i) => entrada.sesiones[i]!.duracion).join(',');
    if (listas.some((l) => forma(l) !== forma(listas[0]!))) {
      avisos.push({
        codigo: 'SIMULTANEAS_NO_EMPAREJAN',
        mensaje: `La variable ${v.id} pide sesiones simultáneas, pero los grupos no tienen la misma cantidad y duración de sesiones; no se aplicó.`,
      });
      continue;
    }
    for (let k = 0; k < listas[0]!.length; k += 1) for (const l of listas.slice(1)) unir(l[k]!, listas[0]![k]!);
  }

  const porRaiz = new Map<number, number[]>();
  for (let i = 0; i < n; i += 1) porRaiz.set(raiz(i), [...(porRaiz.get(raiz(i)) ?? []), i]);

  const nP = estado.nPeriodos;
  return [...porRaiz.values()].map((sesiones) => {
    const conFija = sesiones.find((i) => entrada.sesiones[i]!.fija);
    const fija = conFija !== undefined ? aIndiceDia(entrada, entrada.sesiones[conFija]!.fija!) : null;

    const validas: number[] = [];
    for (let d = 0; d < estado.nDias; d += 1) {
      for (let p = 0; p < nP; p += 1) {
        if (sesiones.every((i) => estado.posicionValida(i, { dia: d, periodo: p }))) validas.push(d * nP + p);
      }
    }
    // Poda: fuera las franjas bloqueadas como DURAS para cualquiera de sus sesiones.
    const prohibidas = new Set<number>();
    for (const i of sesiones) {
      const s = entrada.sesiones[i]!;
      for (const v of vigentes[i]!) {
        if (v.tipo === 'DISPONIBILIDAD' && v.severidad === 'DURA') {
          for (const c of v.parametros.celdas) {
            const d = entrada.estructura.dias.indexOf(c.dia);
            if (c.valor !== 'NO_DISPONIBLE' || d < 0) continue;
            for (let k = 0; k < s.duracion; k += 1) prohibidas.add(d * nP + c.periodo - k);
          }
        }
        if (v.tipo === 'RECREO_NO_INTERRUMPE' && v.severidad === 'DURA' && s.duracion > 1) {
          entrada.estructura.periodos.forEach((per, p) => {
            if (!per.descanso_antes) return;
            for (let k = 1; k < s.duracion; k += 1) for (let d = 0; d < estado.nDias; d += 1) prohibidas.add(d * nP + p - k);
          });
        }
      }
    }
    const podado = validas.filter((x) => !prohibidas.has(x));
    if (podado.length === 0 && !fija) {
      avisos.push({
        codigo: 'SESION_SIN_FRANJA_LIBRE',
        mensaje: `La sesión ${entrada.sesiones[sesiones[0]!]!.id} no tiene ninguna franja que cumpla sus restricciones duras; se ubicará en la menos mala.`,
      });
    }
    return { sesiones, dominio: podado.length > 0 ? podado : validas, fija };
  });
}

export function generarHorario(entrada: EntradaMotor, opciones: OpcionesGeneracion = {}): ResultadoMotor {
  const inicio = Date.now();
  const semilla = opciones.semilla ?? Math.floor(Math.random() * 2 ** 31);
  const tiempoMax = opciones.tiempo_max_ms ?? 20_000;
  const iteracionesMax = opciones.iteraciones_max ?? Number.POSITIVE_INFINITY;
  const azar = crearAleatorio(semilla);
  const avisos: Aviso[] = [];

  const estado = new EstadoHorario(entrada);
  const nP = estado.nPeriodos;
  const unidades = construirUnidades(entrada, estado, avisos);
  const decodificar = (x: number): Posicion => ({ dia: Math.floor(x / nP), periodo: x % nP });
  const moverUnidad = (u: Unidad, pos: Posicion) => estado.mover(u.sesiones, u.sesiones.map(() => pos));

  // 1. Construcción voraz: primero lo fijo, luego lo más difícil de ubicar.
  const orden = [...unidades].sort((a, b) => {
    if (!!a.fija !== !!b.fija) return a.fija ? -1 : 1;
    const durA = a.sesiones.reduce((s, i) => s + entrada.sesiones[i]!.duracion, 0);
    const durB = b.sesiones.reduce((s, i) => s + entrada.sesiones[i]!.duracion, 0);
    return b.sesiones.length - a.sesiones.length || a.dominio.length - b.dominio.length || durB - durA;
  });
  for (const u of orden) {
    if (u.fija) {
      moverUnidad(u, u.fija);
      continue;
    }
    let mejor: Posicion | null = null;
    let mejorDelta = Number.POSITIVE_INFINITY;
    const candidatos = [...u.dominio].sort(() => azar() - 0.5);
    for (const x of candidatos) {
      const pos = decodificar(x);
      const { delta, revertir } = moverUnidad(u, pos);
      revertir();
      if (delta < mejorDelta) {
        mejorDelta = delta;
        mejor = pos;
      }
    }
    if (mejor) moverUnidad(u, mejor);
  }

  // 2. Mejora por recocido simulado en dos fases. Fase 1: eliminar conflictos duros, con temperatura en la escala de
  //    un conflicto (acepta empeorar a veces para salir de mínimos locales) y recalentando por ciclos. Fase 2: con lo duro
  //    resuelto, pulir preferencias sin volver a aceptar conflictos duros.
  const movibles = unidades.filter((u) => !u.fija && u.dominio.length > 1);
  const unidadDe = new Map<number, Unidad>();
  for (const u of unidades) for (const i of u.sesiones) unidadDe.set(i, u);
  const delMismoGrupo = new Map<number, number[]>();
  entrada.sesiones.forEach((_, i) => {
    const g = estado.grupoDe[i]!;
    if (g >= 0) delMismoGrupo.set(g, [...(delMismoGrupo.get(g) ?? []), i]);
  });

  let mejorCosto = estado.costo;
  let mejorDia = Int16Array.from(estado.dia);
  let mejorPeriodo = Int16Array.from(estado.periodo);
  let enConflicto: Unidad[] = [];
  let iteraciones = 0;
  let transcurrido = 0;
  let fase: 1 | 2 = estado.costo < PESO_DURO ? 2 : 1;
  let inicioFase2 = fase === 2 ? 0 : -1;
  const CICLO = 200_000;

  /**
   * Movimiento de región: llevar la unidad `u` al destino. Si ahí hay sesiones del mismo grupo, se traen a su lugar
   * siempre que quepan completas en la región (así un bloque de 2 se cambia por dos sesiones de 1). Nunca se apila una
   * sesión sobre otra del mismo grupo: si el intercambio no cabe, el movimiento se descarta.
   */
  const planearMovimiento = (u: Unidad, destino: Posicion, origen: Posicion) => {
    if (u.sesiones.length !== 1 || estado.grupoDe[u.sesiones[0]!]! < 0) return moverUnidad(u, destino);
    const i = u.sesiones[0]!;
    const largo = entrada.sesiones[i]!.duracion;
    const ocupantes: number[] = [];
    for (const j of delMismoGrupo.get(estado.grupoDe[i]!) ?? []) {
      if (j === i || !estado.ubicada[j] || estado.dia[j] !== destino.dia) continue;
      const pj = estado.periodo[j]!;
      const dj = entrada.sesiones[j]!.duracion;
      if (pj + dj <= destino.periodo || pj >= destino.periodo + largo) continue;
      const v = unidadDe.get(j)!;
      if (v.fija || v.sesiones.length !== 1 || pj < destino.periodo || pj + dj > destino.periodo + largo) return null;
      ocupantes.push(j);
    }
    if (ocupantes.length === 0) return moverUnidad(u, destino);
    if (destino.dia === origen.dia && Math.abs(destino.periodo - origen.periodo) < largo) return null;
    const indices = [i, ...ocupantes];
    const destinos = [destino, ...ocupantes.map((j) => ({ dia: origen.dia, periodo: origen.periodo + estado.periodo[j]! - destino.periodo }))];
    return estado.mover(indices, destinos);
  };

  while (movibles.length > 0 && estado.costo > 0 && iteraciones < iteracionesMax) {
    if ((iteraciones & 1023) === 0) {
      transcurrido = Date.now() - inicio;
      if (transcurrido >= tiempoMax) break;
      if (fase === 1 && (estado.costo < PESO_DURO || transcurrido > tiempoMax * 0.85)) {
        fase = 2;
        inicioFase2 = transcurrido;
      }
    }
    if (fase === 1 && iteraciones % 5000 === 0) {
      const ids = new Set(estado.diagnosticar().incidencias.filter((x) => x.dura).flatMap((x) => x.sesion_ids));
      enConflicto = movibles.filter((u) => u.sesiones.some((i) => ids.has(entrada.sesiones[i]!.id)));
    }
    iteraciones += 1;

    let T: number;
    if (fase === 1) {
      const avance = (iteraciones % CICLO) / CICLO;
      T = PESO_DURO * 0.8 * (0.02 / 0.8) ** avance;
    } else {
      const avance = Math.min(1, (transcurrido - inicioFase2) / Math.max(1, tiempoMax - inicioFase2));
      T = 30 * (0.05 / 30) ** avance;
    }

    const u =
      fase === 1 && enConflicto.length > 0 && azar() < 0.5
        ? enConflicto[Math.floor(azar() * enConflicto.length)]!
        : movibles[Math.floor(azar() * movibles.length)]!;
    const destino = decodificar(u.dominio[Math.floor(azar() * u.dominio.length)]!);
    const origen: Posicion = { dia: estado.dia[u.sesiones[0]!]!, periodo: estado.periodo[u.sesiones[0]!]! };
    if (destino.dia === origen.dia && destino.periodo === origen.periodo) continue;

    const movimiento = planearMovimiento(u, destino, origen);
    if (!movimiento) continue;
    const aceptable = fase === 1 || movimiento.delta < PESO_DURO / 2;

    if (aceptable && (movimiento.delta <= 0 || azar() < Math.exp(-movimiento.delta / T))) {
      if (estado.costo < mejorCosto) {
        mejorCosto = estado.costo;
        mejorDia = Int16Array.from(estado.dia);
        mejorPeriodo = Int16Array.from(estado.periodo);
      }
    } else {
      movimiento.revertir();
    }
  }

  // 3. Restaurar la mejor solución vista y entregar el detalle.
  const todas = entrada.sesiones.map((_, i) => i);
  estado.mover(todas, todas.map((i) => ({ dia: mejorDia[i]!, periodo: mejorPeriodo[i]! })));
  const diagnostico = estado.diagnosticar();
  const espacios = estado.asignarEspacios();

  return {
    ubicaciones: entrada.sesiones.map((s, i) => ({
      sesion_id: s.id,
      dia: entrada.estructura.dias[estado.dia[i]!]!,
      periodo: estado.periodo[i]!,
      espacio_id: espacios.get(i) ?? null,
    })),
    ...diagnostico,
    avisos,
    estadisticas: { iteraciones, duracion_ms: Date.now() - inicio, semilla },
  };
}

/** Valida un horario ya armado (tras una edición manual o antes de publicar) sin mover nada. */
export function evaluarHorario(entrada: EntradaMotor, ubicaciones: readonly (UbicacionFija & { sesion_id: string })[]) {
  const estado = new EstadoHorario(entrada);
  const indice = new Map(entrada.sesiones.map((s, i) => [s.id, i]));
  const sinUbicar: string[] = [];
  const indices: number[] = [];
  const destinos: Posicion[] = [];
  for (const u of ubicaciones) {
    const i = indice.get(u.sesion_id);
    const pos = i === undefined ? null : aIndiceDia(entrada, u);
    if (i === undefined || !pos || !estado.posicionValida(i, pos)) {
      sinUbicar.push(u.sesion_id);
      continue;
    }
    indices.push(i);
    destinos.push(pos);
  }
  estado.mover(indices, destinos);
  const asignados = estado.asignarEspacios();
  const espacios: Record<string, string | null> = {};
  for (const [i, e] of asignados) espacios[entrada.sesiones[i]!.id] = e;
  const ubicadas = new Set(indices);
  for (const [id, i] of indice) if (!ubicadas.has(i) && !sinUbicar.includes(id)) sinUbicar.push(id);
  const diagnostico = estado.diagnosticar();
  // Una sesión sin ubicar son horas del plan de estudios que no se dictan: bloquea la publicación como cualquier choque.
  return { ...diagnostico, conflictos_duros: diagnostico.conflictos_duros + sinUbicar.length, sin_ubicar: sinUbicar, espacios };
}
