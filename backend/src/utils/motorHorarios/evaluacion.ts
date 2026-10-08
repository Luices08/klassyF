import { METADATOS_VARIABLE_HORARIO } from '../../constants/horarios';
import { resolverVariables } from './alcance';
import { CodigoIncidencia, EntradaMotor, Incidencia, Posicion, SesionMotor, VariableDeTipo, VariableMotor } from './tipos';

/** Un incumplimiento duro pesa más que cualquier suma razonable de preferencias. */
export const PESO_DURO = 100_000;

interface Acumulador {
  duros: number;
  blando: number;
  incidencias: Incidencia[] | null;
}

interface Relacion {
  variable: VariableMotor;
  sesiones: number[];
}

type MapaDisponibilidad = Map<number, 'NO_DISPONIBLE' | 'CONDICIONAL'>;

/**
 * Estado de un horario en construcción y su costo, descompuesto en componentes independientes: cada grupo, cada
 * docente, cada celda (día, periodo) para los espacios y un componente global. Mover una sesión solo recalcula los
 * componentes que toca; por eso el generador puede explorar muchas alternativas.
 */
export class EstadoHorario {
  readonly sesiones: SesionMotor[];
  readonly nDias: number;
  readonly nPeriodos: number;
  readonly dia: Int16Array;
  readonly periodo: Int16Array;
  readonly ubicada: Uint8Array;
  readonly grupoDe: Int32Array;
  readonly docentesDe: number[][];

  private readonly descansoAntes: boolean[];
  private readonly entrada: EntradaMotor;
  private readonly sesionesPorGrupo: number[][];
  private readonly sesionesPorDocente: number[][];
  private readonly sesionesConEspacio: number[];
  private readonly unariasPorSesion: VariableMotor[][];
  private readonly relacionesPorGrupo: Relacion[][];
  private readonly variablesPorDocente: VariableMotor[][];
  private readonly relacionesGlobales: Relacion[];
  private readonly sesionEnGlobal: Uint8Array;
  private readonly disponibilidad = new Map<string, MapaDisponibilidad>();
  private readonly espacioAdmiteVarios = new Map<string, boolean>();
  readonly idsGrupo: string[];
  readonly idsDocente: string[];

  private readonly costoGrupo: Float64Array;
  private readonly costoDocente: Float64Array;
  private readonly costoCelda: Float64Array;
  private costoGlobal = 0;
  private total = 0;

  constructor(entrada: EntradaMotor) {
    this.entrada = entrada;
    this.sesiones = entrada.sesiones;
    this.nDias = entrada.estructura.dias.length;
    this.nPeriodos = entrada.estructura.periodos.length;
    this.descansoAntes = entrada.estructura.periodos.map((p) => p.descanso_antes);
    const n = this.sesiones.length;
    this.dia = new Int16Array(n);
    this.periodo = new Int16Array(n);
    this.ubicada = new Uint8Array(n);
    this.grupoDe = new Int32Array(n).fill(-1);
    for (const e of entrada.espacios) this.espacioAdmiteVarios.set(e.id, e.admite_grupos_simultaneos);

    const indiceGrupo = new Map<string, number>();
    const indiceDocente = new Map<string, number>();
    this.idsGrupo = [];
    this.idsDocente = [];
    this.sesionesPorGrupo = [];
    this.sesionesPorDocente = [];
    this.docentesDe = [];
    this.sesionesConEspacio = [];

    this.sesiones.forEach((s, i) => {
      if (s.group_id) {
        let g = indiceGrupo.get(s.group_id);
        if (g === undefined) {
          g = this.idsGrupo.length;
          indiceGrupo.set(s.group_id, g);
          this.idsGrupo.push(s.group_id);
          this.sesionesPorGrupo.push([]);
        }
        this.grupoDe[i] = g;
        this.sesionesPorGrupo[g]!.push(i);
      }
      const docentes: number[] = [];
      for (const id of s.docente_ids) {
        let d = indiceDocente.get(id);
        if (d === undefined) {
          d = this.idsDocente.length;
          indiceDocente.set(id, d);
          this.idsDocente.push(id);
          this.sesionesPorDocente.push([]);
        }
        docentes.push(d);
        this.sesionesPorDocente[d]!.push(i);
      }
      this.docentesDe.push(docentes);
      if (s.espacios_permitidos) this.sesionesConEspacio.push(i);
    });

    // Variables que rigen a cada sesión (cascada de alcance ya aplicada).
    const vigentesPorSesion = this.sesiones.map((s) => resolverVariables(entrada.variables, s));
    this.unariasPorSesion = vigentesPorSesion.map((vs) => vs.filter((v) => v.tipo === 'DISPONIBILIDAD' || v.tipo === 'RECREO_NO_INTERRUMPE'));

    this.relacionesPorGrupo = this.sesionesPorGrupo.map((delGrupo) => {
      const porVariable = new Map<string, Relacion>();
      for (const i of delGrupo) {
        for (const v of vigentesPorSesion[i]!) {
          const meta = METADATOS_VARIABLE_HORARIO[v.tipo];
          if (meta.categoria !== 'GRUPO' || v.tipo === 'RECREO_NO_INTERRUMPE') continue;
          const rel = porVariable.get(v.id) ?? { variable: v, sesiones: [] };
          rel.sesiones.push(i);
          porVariable.set(v.id, rel);
        }
      }
      return [...porVariable.values()];
    });

    this.relacionesGlobales = [];
    const globales = new Map<string, Relacion>();
    vigentesPorSesion.forEach((vs, i) => {
      for (const v of vs) {
        if (v.tipo !== 'MISMO_DIA_ENTRE_GRUPOS') continue;
        const rel = globales.get(v.id) ?? { variable: v, sesiones: [] };
        rel.sesiones.push(i);
        globales.set(v.id, rel);
      }
    });
    this.relacionesGlobales.push(...globales.values());
    this.sesionEnGlobal = new Uint8Array(n);
    for (const rel of this.relacionesGlobales) for (const i of rel.sesiones) this.sesionEnGlobal[i] = 1;

    this.variablesPorDocente = this.idsDocente.map((id) =>
      resolverVariables(entrada.variables, { group_id: null, grade_id: null, subject_id: null, docente_ids: [id] }).filter(
        (v) => METADATOS_VARIABLE_HORARIO[v.tipo].categoria === 'DOCENTE'
      )
    );

    this.costoGrupo = new Float64Array(this.idsGrupo.length);
    this.costoDocente = new Float64Array(this.idsDocente.length);
    this.costoCelda = new Float64Array(this.nDias * this.nPeriodos);
  }

  get costo(): number {
    return this.total;
  }

  // ---------------------------------------------------------------- ubicación

  ocupa(i: number, d: number, p: number): boolean {
    return this.ubicada[i] === 1 && this.dia[i] === d && p >= this.periodo[i]! && p < this.periodo[i]! + this.sesiones[i]!.duracion;
  }

  posicionValida(i: number, pos: Posicion): boolean {
    return pos.dia >= 0 && pos.dia < this.nDias && pos.periodo >= 0 && pos.periodo + this.sesiones[i]!.duracion <= this.nPeriodos;
  }

  /**
   * Mueve (o ubica por primera vez) un conjunto de sesiones y devuelve cuánto cambió el costo. `revertir` deja todo
   * como estaba sin recalcular. Se mueven juntas las sesiones de una unidad (ej. simultáneas entre grupos).
   */
  mover(indices: readonly number[], destinos: readonly (Posicion | null)[]): { delta: number; revertir: () => void } {
    const grupos = new Set<number>();
    const docentes = new Set<number>();
    const celdas = new Set<number>();
    let tocaGlobal = false;

    const marcarCeldas = (i: number) => {
      if (!this.sesiones[i]!.espacios_permitidos || this.ubicada[i] !== 1) return;
      for (let k = 0; k < this.sesiones[i]!.duracion; k += 1) celdas.add(this.dia[i]! * this.nPeriodos + this.periodo[i]! + k);
    };

    for (const i of indices) {
      if (this.grupoDe[i]! >= 0) grupos.add(this.grupoDe[i]!);
      for (const d of this.docentesDe[i]!) docentes.add(d);
      if (this.sesionEnGlobal[i]) tocaGlobal = true;
      marcarCeldas(i);
    }

    const previos = indices.map((i) => ({ ubicada: this.ubicada[i]!, dia: this.dia[i]!, periodo: this.periodo[i]! }));
    indices.forEach((i, k) => {
      const destino = destinos[k] ?? null;
      if (destino) {
        this.ubicada[i] = 1;
        this.dia[i] = destino.dia;
        this.periodo[i] = destino.periodo;
      } else {
        this.ubicada[i] = 0;
      }
    });
    for (const i of indices) marcarCeldas(i);

    const guardado = {
      grupos: [...grupos].map((g) => [g, this.costoGrupo[g]!] as const),
      docentes: [...docentes].map((d) => [d, this.costoDocente[d]!] as const),
      celdas: [...celdas].map((c) => [c, this.costoCelda[c]!] as const),
      global: this.costoGlobal,
      total: this.total,
    };

    let delta = 0;
    for (const [g, antes] of guardado.grupos) {
      const ahora = this.puntuar(this.evaluarGrupo(g, null));
      this.costoGrupo[g] = ahora;
      delta += ahora - antes;
    }
    for (const [d, antes] of guardado.docentes) {
      const ahora = this.puntuar(this.evaluarDocente(d, null));
      this.costoDocente[d] = ahora;
      delta += ahora - antes;
    }
    for (const [c, antes] of guardado.celdas) {
      const ahora = this.puntuar(this.evaluarCelda(c, null));
      this.costoCelda[c] = ahora;
      delta += ahora - antes;
    }
    if (tocaGlobal) {
      const ahora = this.puntuar(this.evaluarGlobal(null));
      delta += ahora - this.costoGlobal;
      this.costoGlobal = ahora;
    }
    this.total += delta;

    const revertir = () => {
      indices.forEach((i, k) => {
        const p = previos[k]!;
        this.ubicada[i] = p.ubicada;
        this.dia[i] = p.dia;
        this.periodo[i] = p.periodo;
      });
      for (const [g, v] of guardado.grupos) this.costoGrupo[g] = v;
      for (const [d, v] of guardado.docentes) this.costoDocente[d] = v;
      for (const [c, v] of guardado.celdas) this.costoCelda[c] = v;
      this.costoGlobal = guardado.global;
      this.total = guardado.total;
    };
    return { delta, revertir };
  }

  /** Recalcula todo desde cero con el detalle de cada incumplimiento (para mostrar conflictos y validar al publicar). */
  diagnosticar(): { conflictos_duros: number; penalizacion_blanda: number; incidencias: Incidencia[] } {
    const acc: Acumulador = { duros: 0, blando: 0, incidencias: [] };
    this.idsGrupo.forEach((_, g) => this.sumar(acc, this.evaluarGrupo(g, acc.incidencias)));
    this.idsDocente.forEach((_, d) => this.sumar(acc, this.evaluarDocente(d, acc.incidencias)));
    for (let c = 0; c < this.nDias * this.nPeriodos; c += 1) this.sumar(acc, this.evaluarCelda(c, acc.incidencias));
    this.sumar(acc, this.evaluarGlobal(acc.incidencias));
    return { conflictos_duros: acc.duros, penalizacion_blanda: acc.blando, incidencias: acc.incidencias ?? [] };
  }

  /** Asigna un espacio concreto a cada sesión que lo exige, consistente en todos los periodos de su bloque. */
  asignarEspacios(): Map<number, string | null> {
    const ocupados = new Set<string>();
    const resultado = new Map<number, string | null>();
    const orden = [...this.sesionesConEspacio].sort(
      (a, b) => this.sesiones[a]!.espacios_permitidos!.length - this.sesiones[b]!.espacios_permitidos!.length
    );
    for (const i of orden) {
      if (!this.ubicada[i]) continue;
      const s = this.sesiones[i]!;
      const elegido =
        s.espacios_permitidos!.find((e) => {
          if (this.espacioAdmiteVarios.get(e)) return true;
          for (let k = 0; k < s.duracion; k += 1) if (ocupados.has(`${e}|${this.dia[i]}|${this.periodo[i]! + k}`)) return false;
          return true;
        }) ?? null;
      resultado.set(i, elegido);
      if (elegido) for (let k = 0; k < s.duracion; k += 1) ocupados.add(`${elegido}|${this.dia[i]}|${this.periodo[i]! + k}`);
    }
    return resultado;
  }

  // ---------------------------------------------------------------- componentes

  private puntuar(acc: Acumulador): number {
    return acc.duros * PESO_DURO + acc.blando;
  }

  private sumar(destino: Acumulador, origen: Acumulador): void {
    destino.duros += origen.duros;
    destino.blando += origen.blando;
  }

  private penalizar(
    acc: Acumulador,
    codigo: CodigoIncidencia,
    variable: VariableMotor | null,
    magnitud: number,
    sesiones: readonly number[],
    mensaje: () => string
  ): void {
    if (magnitud <= 0) return;
    const dura = variable === null || variable.severidad === 'DURA';
    if (dura) acc.duros += magnitud;
    else acc.blando += magnitud * variable.peso;
    acc.incidencias?.push({
      codigo,
      variable_id: variable?.id ?? null,
      dura,
      magnitud,
      sesion_ids: sesiones.map((i) => this.sesiones[i]!.id),
      mensaje: mensaje(),
    });
  }

  private nombreDia(d: number): string {
    return ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][this.entrada.estructura.dias[d] ?? 0] ?? `día ${d + 1}`;
  }

  private mapaDisponibilidad(v: VariableDeTipo<'DISPONIBILIDAD'>): MapaDisponibilidad {
    let mapa = this.disponibilidad.get(v.id);
    if (!mapa) {
      mapa = new Map();
      for (const c of v.parametros.celdas) {
        const d = this.entrada.estructura.dias.indexOf(c.dia);
        if (d >= 0 && c.periodo < this.nPeriodos) mapa.set(d * this.nPeriodos + c.periodo, c.valor);
      }
      this.disponibilidad.set(v.id, mapa);
    }
    return mapa;
  }

  private evaluarUnarias(i: number, acc: Acumulador): void {
    const s = this.sesiones[i]!;
    const d = this.dia[i]!;
    const p = this.periodo[i]!;
    for (const v of this.unariasPorSesion[i]!) {
      if (v.tipo === 'DISPONIBILIDAD') {
        const mapa = this.mapaDisponibilidad(v);
        let no = 0;
        let condicional = 0;
        for (let k = 0; k < s.duracion; k += 1) {
          const valor = mapa.get(d * this.nPeriodos + p + k);
          if (valor === 'NO_DISPONIBLE') no += 1;
          else if (valor === 'CONDICIONAL') condicional += 1;
        }
        this.penalizar(acc, 'DISPONIBILIDAD', v, no, [i], () => `Programada en ${no} franja(s) marcada(s) como no disponible (${this.nombreDia(d)}).`);
        if (condicional > 0) {
          acc.blando += condicional * v.peso;
          acc.incidencias?.push({
            codigo: 'DISPONIBILIDAD',
            variable_id: v.id,
            dura: false,
            magnitud: condicional,
            sesion_ids: [s.id],
            mensaje: `Programada en ${condicional} franja(s) condicional(es) (${this.nombreDia(d)}).`,
          });
        }
      } else if (v.tipo === 'RECREO_NO_INTERRUMPE' && s.duracion > 1) {
        let cruza = false;
        for (let k = 1; k < s.duracion; k += 1) if (this.descansoAntes[p + k]) cruza = true;
        this.penalizar(acc, 'RECREO_NO_INTERRUMPE', v, cruza ? 1 : 0, [i], () => `El bloque de ${s.duracion} horas queda partido por el descanso.`);
      }
    }
  }

  private colocadas(indices: readonly number[]): number[] {
    return indices.filter((i) => this.ubicada[i] === 1);
  }

  private adyacentes(a: number, b: number, descansoSepara: boolean): boolean {
    if (this.dia[a] !== this.dia[b]) return false;
    const inicioB = this.periodo[b]!;
    if (this.periodo[a]! + this.sesiones[a]!.duracion !== inicioB) return false;
    return !(descansoSepara && this.descansoAntes[inicioB]);
  }

  /** Choques: cuántas horas sobran en celdas ocupadas por más de una sesión. */
  private choques(indices: readonly number[], acc: Acumulador, codigo: 'CHOQUE_GRUPO' | 'CHOQUE_DOCENTE', quien: string): number[] {
    const ocupacion = Array.from<number>({ length: this.nDias * this.nPeriodos }).fill(0);
    for (const i of indices) {
      for (let k = 0; k < this.sesiones[i]!.duracion; k += 1) ocupacion[this.dia[i]! * this.nPeriodos + this.periodo[i]! + k]! += 1;
    }
    for (let c = 0; c < ocupacion.length; c += 1) {
      const n = ocupacion[c]!;
      if (n <= 1) continue;
      const d = Math.floor(c / this.nPeriodos);
      const p = c % this.nPeriodos;
      const enCelda = indices.filter((i) => this.ocupa(i, d, p));
      this.penalizar(acc, codigo, null, n - 1, enCelda, () => `${quien} tiene ${n} sesiones a la vez el ${this.nombreDia(d)} en el periodo ${p + 1}.`);
    }
    return ocupacion;
  }

  private huecosPorDia(ocupacion: readonly number[]): number[] {
    const huecos: number[] = [];
    for (let d = 0; d < this.nDias; d += 1) {
      let primero = -1;
      let ultimo = -1;
      let ocupados = 0;
      for (let p = 0; p < this.nPeriodos; p += 1) {
        if (ocupacion[d * this.nPeriodos + p]! > 0) {
          if (primero < 0) primero = p;
          ultimo = p;
          ocupados += 1;
        }
      }
      huecos.push(primero < 0 ? 0 : ultimo - primero + 1 - ocupados);
    }
    return huecos;
  }

  private evaluarGrupo(g: number, incidencias: Incidencia[] | null): Acumulador {
    const acc: Acumulador = { duros: 0, blando: 0, incidencias };
    const delGrupo = this.colocadas(this.sesionesPorGrupo[g]!);
    const ocupacion = this.choques(delGrupo, acc, 'CHOQUE_GRUPO', `El grupo ${this.idsGrupo[g]}`);
    for (const i of delGrupo) this.evaluarUnarias(i, acc);

    for (const { variable: v, sesiones } of this.relacionesPorGrupo[g]!) {
      const S = this.colocadas(sesiones);
      if (S.length === 0) continue;

      switch (v.tipo) {
        case 'NO_MISMO_DIA': {
          for (let d = 0; d < this.nDias; d += 1) {
            const delDia = S.filter((i) => this.dia[i] === d);
            this.penalizar(acc, v.tipo, v, delDia.length - 1, delDia, () => `${delDia.length} sesiones el mismo día (${this.nombreDia(d)}) que no deberían coincidir.`);
          }
          break;
        }
        case 'NO_CONSECUTIVAS': {
          for (const a of S) {
            for (const b of S) {
              if (a !== b && this.adyacentes(a, b, v.parametros.descanso_separa)) {
                this.penalizar(acc, v.tipo, v, 1, [a, b], () => `Dos sesiones seguidas el ${this.nombreDia(this.dia[a]!)} que no pueden ser consecutivas.`);
              }
            }
          }
          break;
        }
        case 'DISTRIBUCION_SEMANAL': {
          for (const delaAsignatura of agrupar(S, (i) => this.sesiones[i]!.subject_id ?? '')) {
            const dias = new Map<number, number[]>();
            for (const i of delaAsignatura) dias.set(this.dia[i]!, [...(dias.get(this.dia[i]!) ?? []), i]);
            const { max_sesiones_dia: max, min_dias_distintos: minDias } = v.parametros;
            if (max !== undefined) {
              for (const [d, delDia] of dias) {
                this.penalizar(acc, v.tipo, v, delDia.length - max, delDia, () => `${delDia.length} sesiones de la misma asignatura el ${this.nombreDia(d)} (máximo ${max}).`);
              }
            }
            if (minDias !== undefined) {
              const exigidos = Math.min(minDias, delaAsignatura.length);
              this.penalizar(acc, v.tipo, v, exigidos - dias.size, delaAsignatura, () => `La asignatura se da en ${dias.size} día(s); se esperaban al menos ${exigidos}.`);
            }
          }
          break;
        }
        case 'MISMO_DIA': {
          const [a, b] = v.asignatura_ids;
          const diasA = new Set(S.filter((i) => this.sesiones[i]!.subject_id === a).map((i) => this.dia[i]!));
          const diasB = new Set(S.filter((i) => this.sesiones[i]!.subject_id === b).map((i) => this.dia[i]!));
          const sueltos = [...diasA].filter((d) => !diasB.has(d)).length + [...diasB].filter((d) => !diasA.has(d)).length;
          this.penalizar(acc, v.tipo, v, sueltos, S, () => `En ${sueltos} día(s) se da una de las dos asignaturas sin la otra.`);
          break;
        }
        case 'CONSECUTIVAS': {
          const [a, b] = v.asignatura_ids;
          const deA = S.filter((i) => this.sesiones[i]!.subject_id === a);
          const deB = S.filter((i) => this.sesiones[i]!.subject_id === b);
          const [ancla, pareja] = deA.length <= deB.length ? [deA, deB] : [deB, deA];
          const usadas = new Set<number>();
          let sinPareja = 0;
          for (const x of ancla) {
            const y = pareja.find((z) => {
              if (usadas.has(z)) return false;
              const [primera, segunda] = ancla === deA ? [x, z] : [z, x];
              if (this.adyacentes(primera, segunda, true)) return true;
              return v.parametros.orden === 'ARBITRARIO' && this.adyacentes(segunda, primera, true);
            });
            if (y === undefined) sinPareja += 1;
            else usadas.add(y);
          }
          this.penalizar(acc, v.tipo, v, sinPareja, S, () => `${sinPareja} sesión(es) no quedaron seguidas de su asignatura pareja.`);
          break;
        }
        case 'MISMA_FRANJA_CADA_DIA': {
          for (const delaAsignatura of agrupar(S, (i) => this.sesiones[i]!.subject_id ?? '')) {
            const franjas = new Set(delaAsignatura.map((i) => this.periodo[i]!));
            this.penalizar(acc, v.tipo, v, franjas.size - 1, delaAsignatura, () => `La asignatura empieza en ${franjas.size} franjas distintas a lo largo de la semana.`);
          }
          break;
        }
        case 'MAX_HORAS_DIA_GRUPO': {
          for (const delaAsignatura of agrupar(S, (i) => this.sesiones[i]!.subject_id ?? '')) {
            for (let d = 0; d < this.nDias; d += 1) {
              const delDia = delaAsignatura.filter((i) => this.dia[i] === d);
              const horas = delDia.reduce((suma, i) => suma + this.sesiones[i]!.duracion, 0);
              this.penalizar(acc, v.tipo, v, horas - v.parametros.max, delDia, () => `${horas} horas de la misma asignatura el ${this.nombreDia(d)} (máximo ${v.parametros.max}).`);
            }
          }
          break;
        }
        case 'MAX_HUECOS_GRUPO': {
          this.huecosPorDia(ocupacion).forEach((huecos, d) => {
            this.penalizar(acc, v.tipo, v, huecos - v.parametros.max_por_dia, [], () => `El grupo tiene ${huecos} hora(s) libre(s) intermedia(s) el ${this.nombreDia(d)}.`);
          });
          break;
        }
        default:
          break;
      }
    }
    return acc;
  }

  private evaluarDocente(d: number, incidencias: Incidencia[] | null): Acumulador {
    const acc: Acumulador = { duros: 0, blando: 0, incidencias };
    const delDocente = this.colocadas(this.sesionesPorDocente[d]!);
    const ocupacion = this.choques(delDocente, acc, 'CHOQUE_DOCENTE', `El docente ${this.idsDocente[d]}`);

    // Las reuniones no tienen grupo: sus reglas de tiempo libre se evalúan aquí, una sola vez (en su primer docente).
    for (const i of delDocente) if (this.grupoDe[i]! < 0 && this.docentesDe[i]![0] === d) this.evaluarUnarias(i, acc);

    for (const v of this.variablesPorDocente[d]!) {
      if (v.tipo === 'MAX_HORAS_DIA_DOCENTE') {
        for (let dia = 0; dia < this.nDias; dia += 1) {
          let horas = 0;
          for (let p = 0; p < this.nPeriodos; p += 1) if (ocupacion[dia * this.nPeriodos + p]! > 0) horas += 1;
          this.penalizar(acc, v.tipo, v, horas - v.parametros.max, [], () => `El docente ${this.idsDocente[d]} tiene ${horas} horas el ${this.nombreDia(dia)} (máximo ${v.parametros.max}).`);
        }
      } else if (v.tipo === 'MAX_HUECOS_DOCENTE') {
        this.huecosPorDia(ocupacion).forEach((huecos, dia) => {
          this.penalizar(acc, v.tipo, v, huecos - v.parametros.max_por_dia, [], () => `El docente ${this.idsDocente[d]} tiene ${huecos} hora(s) libre(s) intermedia(s) el ${this.nombreDia(dia)}.`);
        });
      } else if (v.tipo === 'MAX_CONSECUTIVAS_DOCENTE') {
        for (let dia = 0; dia < this.nDias; dia += 1) {
          let racha = 0;
          for (let p = 0; p < this.nPeriodos; p += 1) {
            const ocupado = ocupacion[dia * this.nPeriodos + p]! > 0;
            if (!ocupado || (v.parametros.descanso_separa && this.descansoAntes[p])) racha = 0;
            if (ocupado) {
              racha += 1;
              if (racha > v.parametros.max) {
                this.penalizar(acc, v.tipo, v, 1, [], () => `El docente ${this.idsDocente[d]} supera ${v.parametros.max} horas seguidas el ${this.nombreDia(dia)}.`);
              }
            }
          }
        }
      }
    }
    return acc;
  }

  private evaluarCelda(c: number, incidencias: Incidencia[] | null): Acumulador {
    const acc: Acumulador = { duros: 0, blando: 0, incidencias };
    const d = Math.floor(c / this.nPeriodos);
    const p = c % this.nPeriodos;
    const enCelda = this.sesionesConEspacio.filter((i) => this.ocupa(i, d, p));
    if (enCelda.length === 0) return acc;

    // Emparejamiento voraz: primero las sesiones con menos opciones de espacio.
    enCelda.sort((a, b) => this.sesiones[a]!.espacios_permitidos!.length - this.sesiones[b]!.espacios_permitidos!.length);
    const usados = new Set<string>();
    const sinEspacio: number[] = [];
    for (const i of enCelda) {
      const libre = this.sesiones[i]!.espacios_permitidos!.find((e) => this.espacioAdmiteVarios.get(e) || !usados.has(e));
      if (libre === undefined) sinEspacio.push(i);
      else usados.add(libre);
    }
    this.penalizar(acc, 'CHOQUE_ESPACIO', null, sinEspacio.length, sinEspacio, () => `${sinEspacio.length} sesión(es) sin espacio disponible el ${this.nombreDia(d)} en el periodo ${p + 1}.`);
    return acc;
  }

  private evaluarGlobal(incidencias: Incidencia[] | null): Acumulador {
    const acc: Acumulador = { duros: 0, blando: 0, incidencias };
    for (const { variable: v, sesiones } of this.relacionesGlobales) {
      const porGrupo = agrupar(this.colocadas(sesiones), (i) => String(this.grupoDe[i]));
      const maxK = Math.max(0, ...porGrupo.map((x) => x.length));
      for (let k = 0; k < maxK; k += 1) {
        const kesimas = porGrupo.map((x) => x[k]).filter((i): i is number => i !== undefined);
        const dias = new Set(kesimas.map((i) => this.dia[i]!));
        this.penalizar(acc, 'MISMO_DIA_ENTRE_GRUPOS', v, dias.size - 1, kesimas, () => `Las sesiones que deberían coincidir de día entre grupos quedaron en ${dias.size} días distintos.`);
      }
    }
    return acc;
  }
}

function agrupar<T>(items: readonly T[], clave: (item: T) => string): T[][] {
  const grupos = new Map<string, T[]>();
  for (const item of items) grupos.set(clave(item), [...(grupos.get(clave(item)) ?? []), item]);
  return [...grupos.values()];
}
