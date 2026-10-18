import { round2 } from './siee';
import { DatosEstudios, FilaValoracion } from './certificados';

/**
 * PROVISIONAL — esto es el «boletín final» de M17 (el maestro le asigna los boletines por periodo y el final). Mientras M17 no lo
 * entregue, este armado junta los boletines por periodo en la tabla anual con lo MÍNIMO que lista el maestro para el certificado
 * de estudio: área o asignatura, intensidad horaria semanal y anual, calificación definitiva numérica y su equivalencia nacional.
 * Todo lo demás (columnas por periodo, letras, áreas o asignaturas, formato) es decisión de cada institución y no se fija aquí.
 * Cuando M17 tenga su boletín final, se reemplaza esta función y M26 no cambia: solo dibuja la tabla que reciba.
 */

/** Lo que del boletín por periodo (M17) necesita el certificado: ya viene calculado con las reglas de M06/M12. */
export interface BoletinDePeriodo {
  numero: number;
  areas: Array<{
    area_id: string;
    nombre: string;
    nota_area: number | null;
    /** Todas sus asignaturas son exentas por traslado en ese periodo. */
    exenta?: boolean;
    asignaturas: Array<{
      subject_id: string;
      nombre: string;
      nota_asignatura: number | null;
      /** Exenta por traslado en ese periodo: no cuenta ni como nota ni como faltante. */
      exenta?: boolean;
      /** La nota de ese periodo se homologó de la institución de procedencia. */
      homologada?: boolean;
    }>;
  }>;
}

export interface PeriodoDelAnio {
  numero: number;
  nombre: string;
  porcentaje: number;
}

/**
 * Nota final de un conjunto de periodos: cada nota pesa el porcentaje que el año lectivo (M05) le asignó. Sin todas las
 * notas cerradas no hay definitiva (nunca se promedia lo que falta). Como el promedio por periodo es lineal, ponderar las
 * notas de área da lo mismo que recalcular el área con las definitivas de sus asignaturas, sea cual sea su método (M06).
 * Los periodos exentos por traslado (`exentos[i]`) no entran: su porcentaje se reparte entre los cursados o evaluados.
 */
export function notaDefinitiva(notas: ReadonlyArray<number | null>, porcentajes: readonly number[], exentos: readonly boolean[] = []): number | null {
  if (notas.length === 0 || notas.length !== porcentajes.length) return null;
  const evaluados = notas.map((n, i) => ({ n, p: porcentajes[i] as number })).filter((_, i) => !exentos[i]);
  const totalPeso = evaluados.reduce((suma, x) => suma + x.p, 0);
  if (evaluados.length === 0 || totalPeso <= 0 || evaluados.some((x) => x.n === null)) return null;
  return round2(evaluados.reduce((suma, x) => suma + (x.n as number) * x.p, 0) / totalPeso);
}

/**
 * Junta los boletines de todos los periodos en la tabla anual. `intensidades` es la intensidad horaria semanal del plan de estudios
 * por asignatura y `semanasLectivas` las del año (M05), con las que sale la anual; `decimales` es la precisión de la escala de la
 * institución (M05) y `nacional` traduce una nota a su equivalencia en la escala nacional según los rangos que la institución definió.
 */
export function armarTablaValoraciones(
  periodos: readonly PeriodoDelAnio[],
  boletines: readonly BoletinDePeriodo[],
  intensidades: ReadonlyMap<string, number>,
  semanasLectivas: number | null,
  decimales: number,
  nacional: (nota: number) => string,
  /** Notas finales del cierre de promoción (M19), por `area:<id>` o `asignatura:<id>`: mandan sobre el cálculo (incluyen la recuperación final). */
  notasDelCierre: ReadonlyMap<string, number> = new Map()
): Omit<DatosEstudios, 'promocion'> {
  const ordenados = [...periodos].sort((a, b) => a.numero - b.numero);
  const porcentajes = ordenados.map((p) => p.porcentaje);
  const boletinDe = (numero: number) => boletines.find((b) => b.numero === numero);
  const nota = (n: number | null) => (n === null ? '—' : n.toFixed(decimales));
  const equivalencia = (n: number | null) => (n === null ? '—' : nacional(n));

  // El orden y la composición de áreas salen del primer periodo; todos comparten el mismo plan.
  const base = boletinDe(ordenados[0]?.numero ?? -1);
  const filas: FilaValoracion[] = [];
  let completo = (base?.areas.length ?? 0) > 0;
  let hayHomologadas = false;
  let hayExentas = false;
  // «E» marca lo exento todo el año (no se cursó y no tiene nota); «(H)» lo que tiene algún periodo homologado.
  const celdaNota = (definitiva: number | null, exentaTodoElAnio: boolean, homologada: boolean) =>
    exentaTodoElAnio ? 'E' : `${nota(definitiva)}${homologada && definitiva !== null ? ' (H)' : ''}`;
  for (const area of base?.areas ?? []) {
    const deArea = ordenados.map((p) => boletinDe(p.numero)?.areas.find((a) => a.area_id === area.area_id));
    const exentosArea = deArea.map((a) => Boolean(a?.exenta));
    const areaExentaTodoElAnio = exentosArea.length > 0 && exentosArea.every(Boolean);
    const definitivaArea =
      notasDelCierre.get(`area:${area.area_id}`) ??
      (areaExentaTodoElAnio ? null : notaDefinitiva(deArea.map((a) => a?.nota_area ?? null), porcentajes, exentosArea));
    if (definitivaArea === null && !areaExentaTodoElAnio) completo = false;
    const areaHomologada = deArea.some((a) => a?.asignaturas.some((s) => s.homologada));
    filas.push({ nivel: 'AREA', celdas: [area.nombre, '', '', celdaNota(definitivaArea, areaExentaTodoElAnio, areaHomologada), equivalencia(definitivaArea)] });
    for (const asignatura of area.asignaturas) {
      const dePeriodos = deArea.map((a) => a?.asignaturas.find((s) => s.subject_id === asignatura.subject_id));
      const exentos = dePeriodos.map((s) => Boolean(s?.exenta));
      const exentaTodoElAnio = exentos.every(Boolean);
      const homologada = dePeriodos.some((s) => s?.homologada);
      if (exentos.some(Boolean)) hayExentas = true;
      if (homologada) hayHomologadas = true;
      const definitiva =
        notasDelCierre.get(`asignatura:${asignatura.subject_id}`) ??
        (exentaTodoElAnio ? null : notaDefinitiva(dePeriodos.map((s) => s?.nota_asignatura ?? null), porcentajes, exentos));
      if (definitiva === null && !exentaTodoElAnio) completo = false;
      const semanal = intensidades.get(asignatura.subject_id) ?? null;
      const anual = semanal === null || semanasLectivas === null ? null : Math.round(semanal * semanasLectivas);
      filas.push({
        nivel: 'ASIGNATURA',
        celdas: [
          asignatura.nombre,
          semanal === null ? '—' : String(semanal),
          anual === null ? '—' : String(anual),
          celdaNota(definitiva, exentaTodoElAnio, homologada),
          equivalencia(definitiva),
        ],
      });
    }
  }

  const pesos = ordenados.map((p) => `${p.nombre} ${p.porcentaje}%`).join(', ');
  return {
    tabla: {
      columnas: ['Área / Asignatura', 'IHS', 'IHA', 'Calificación final', 'Escala nacional'],
      filas,
      pie:
        `IHS: intensidad horaria semanal. IHA: intensidad horaria anual (horas semanales por las semanas lectivas del año). ` +
        `Calificación final: notas de periodo ponderadas (${pesos}), con la recuperación de fin de año cuando la hubo.${completo ? '' : ' Lo que aún no está definido aparece con «—».'}` +
        (hayHomologadas ? ' (H): incluye notas homologadas de la institución de procedencia por traslado, convertidas a la escala de la institución.' : '') +
        (hayExentas ? ' E: exenta por traslado (no se cursó en la institución de procedencia); los periodos exentos no entran en la calificación final.' : ''),
    },
    completo,
  };
}
