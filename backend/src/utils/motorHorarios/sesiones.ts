import { Franja } from '../franjas';
import { resolverVariables } from './alcance';
import { ajustarBloquesATramos, tramosDeSemana } from './bloques';
import { AsignacionMotor, Aviso, EspacioMotor, EstructuraSemana, SesionMotor, VariableDeTipo, VariableMotor } from './tipos';

/**
 * La semana del motor sale de la jornada (M01): sus días hábiles y sus franjas. M09 no define estructura propia.
 * Solo las franjas de CLASE son periodos asignables; un DESCANSO se recuerda como `descanso_antes` del siguiente.
 */
export function construirEstructura(diasHabiles: readonly number[], franjas: readonly Franja[]): EstructuraSemana {
  const periodos: EstructuraSemana['periodos'] = [];
  let descansoPendiente = false;
  for (const f of franjas) {
    if (f.tipo === 'DESCANSO') {
      descansoPendiente = periodos.length > 0;
      continue;
    }
    periodos.push({ nombre: f.nombre, hora_inicio: f.hora_inicio, hora_fin: f.hora_fin, descanso_antes: descansoPendiente });
    descansoPendiente = false;
  }
  return { dias: [...diasHabiles].sort((a, b) => a - b), periodos };
}

/** Parte unas horas en bloques según el patrón; si el patrón no suma esas horas se usa su bloque mayor y se avisa. */
function partirEnBloques(horas: number, bloques: readonly number[] | null): { bloques: number[]; cuadra: boolean } {
  if (!bloques || bloques.length === 0) return { bloques: Array.from({ length: horas }, () => 1), cuadra: true };
  const suma = bloques.reduce((s, b) => s + b, 0);
  if (suma === horas) return { bloques: [...bloques], cuadra: true };

  const tamano = Math.max(...bloques);
  const resultado: number[] = [];
  let resto = horas;
  while (resto > 0) {
    const b = Math.min(tamano, resto);
    resultado.push(b);
    resto -= b;
  }
  return { bloques: resultado, cuadra: false };
}

/**
 * Un bloque de varias horas debe quedar entero entre dos descansos (y dentro del tiempo libre del docente). Si los bloques
 * de un grupo, o de un docente, no caben así en la semana, los que sobran se parten: es más importante respetar el bloque
 * que su largo. Sale solo de la carga y de la estructura de la jornada, nunca de un horario generado, para que publicar o
 * editar vuelva a dar las mismas sesiones.
 */
function ajustarBloquesDeLaSemana(
  bloquesPorAsignacion: Map<string, number[]>,
  asignaciones: readonly AsignacionMotor[],
  variables: readonly VariableMotor[],
  estructura: EstructuraSemana
): void {
  const reajustar = (delas: readonly AsignacionMotor[], tramos: readonly number[]) => {
    const bloques = delas.flatMap((a) => (bloquesPorAsignacion.get(a.id) ?? []).map((tamano) => ({ asignacion: a.id, tamano })));
    const ajustados = ajustarBloquesATramos(bloques, tramos);
    for (const a of delas) bloquesPorAsignacion.set(a.id, ajustados.filter((b) => b.asignacion === a.id).map((b) => b.tamano));
  };
  const porClave = (clave: (a: AsignacionMotor) => string) => {
    const mapa = new Map<string, AsignacionMotor[]>();
    for (const a of asignaciones) mapa.set(clave(a), [...(mapa.get(clave(a)) ?? []), a]);
    return mapa;
  };

  const tramosLibres = tramosDeSemana(estructura);
  for (const delGrupo of porClave((a) => a.group_id).values()) reajustar(delGrupo, tramosLibres);

  for (const [docente, delDocente] of porClave((a) => a.docente_id)) {
    const bloqueadas = new Set<string>();
    const sujeto = { group_id: null, grade_id: null, subject_id: null, docente_ids: [docente] };
    for (const v of resolverVariables(variables, sujeto)) {
      if (v.tipo !== 'DISPONIBILIDAD' || v.severidad !== 'DURA' || v.docente_ids.length === 0) continue;
      for (const c of v.parametros.celdas) if (c.valor === 'NO_DISPONIBLE') bloqueadas.add(`${c.dia}-${c.periodo}`);
    }
    reajustar(delDocente, bloqueadas.size === 0 ? tramosLibres : tramosDeSemana(estructura, bloqueadas));
  }
}

/**
 * Convierte la carga de clase de M08 en sesiones a ubicar, más las reuniones colectivas de docentes. Las sesiones de
 * una asignación salen ordenadas de mayor a menor duración: así el k-ésimo bloque de dos grupos simultáneos coincide.
 */
export function expandirSesiones(
  asignaciones: readonly AsignacionMotor[],
  variables: readonly VariableMotor[],
  estructura: EstructuraSemana
): { sesiones: SesionMotor[]; avisos: Aviso[] } {
  const sesiones: SesionMotor[] = [];
  const avisos: Aviso[] = [];
  const maxBloque = Math.max(1, ...tramosDeSemana(estructura));

  const conCarga = asignaciones.filter((a) => a.horas_semanales > 0);
  const pedidos = new Map<string, number[]>();
  for (const a of conCarga) {
    const sujeto = { group_id: a.group_id, grade_id: a.grade_id, subject_id: a.subject_id, docente_ids: [a.docente_id] };
    const distribucion = resolverVariables(variables, sujeto).find((v): v is VariableDeTipo<'DISTRIBUCION_BLOQUES'> => v.tipo === 'DISTRIBUCION_BLOQUES');
    const { bloques, cuadra } = partirEnBloques(a.horas_semanales, distribucion?.parametros.bloques ?? null);
    if (!cuadra && distribucion) {
      avisos.push({
        codigo: 'BLOQUES_NO_CUADRAN',
        mensaje: `El patrón de bloques [${distribucion.parametros.bloques.join(', ')}] no suma las ${a.horas_semanales} horas de la asignación ${a.id}; se usó [${bloques.join(', ')}].`,
      });
    }
    pedidos.set(a.id, bloques);
  }
  const bloquesPorAsignacion = new Map([...pedidos].map(([id, bloques]) => [id, [...bloques]]));
  ajustarBloquesDeLaSemana(bloquesPorAsignacion, conCarga, variables, estructura);

  for (const a of conCarga) {
    const finales = bloquesPorAsignacion.get(a.id)!;
    const orden = (bloques: readonly number[]) => [...bloques].sort((x, y) => y - x).join(', ');
    if (orden(finales) !== orden(pedidos.get(a.id)!)) {
      avisos.push({
        codigo: 'BLOQUES_PARTIDOS',
        mensaje: `Los bloques [${orden(pedidos.get(a.id)!)}] de la asignación ${a.id} no caben enteros entre descansos y en el tiempo libre de su docente; se partieron en [${orden(finales)}] para no montar un bloque sobre el descanso.`,
      });
    }

    const sujeto = { group_id: a.group_id, grade_id: a.grade_id, subject_id: a.subject_id, docente_ids: [a.docente_id] };
    const espacio = resolverVariables(variables, sujeto).find((v): v is VariableDeTipo<'ESPACIO_REQUERIDO'> => v.tipo === 'ESPACIO_REQUERIDO');

    [...finales]
      .sort((x, y) => y - x)
      .forEach((duracion, indice) => {
        sesiones.push({
          ...sujeto,
          id: `${a.id}#${indice}`,
          asignacion_id: a.id,
          reunion_variable_id: null,
          duracion,
          indice,
          espacios_permitidos: espacio ? [...espacio.parametros.espacio_ids] : null,
          fija: null,
        });
      });
  }

  for (const v of variables) {
    if (v.tipo !== 'REUNION_COLECTIVA' || v.es_excepcion) continue;
    if (v.docente_ids.length === 0) {
      avisos.push({ codigo: 'REUNION_SIN_DOCENTES', mensaje: `La reunión "${v.parametros.nombre}" no tiene docentes y no se programa.` });
      continue;
    }
    for (let indice = 0; indice < v.parametros.sesiones; indice += 1) {
      sesiones.push({
        id: `${v.id}#${indice}`,
        asignacion_id: null,
        reunion_variable_id: v.id,
        group_id: null,
        grade_id: null,
        subject_id: null,
        docente_ids: [...v.docente_ids],
        duracion: Math.min(v.parametros.duracion, maxBloque),
        indice,
        espacios_permitidos: null,
        fija: null,
      });
    }
  }

  return { sesiones, avisos };
}

/**
 * Antes de generar: ¿caben las horas? Un grupo con más horas que periodos, o un docente con más horas que franjas
 * disponibles, no tiene solución; se avisa en vez de dejar que el motor "falle" sin explicar por qué.
 */
export function diagnosticarCapacidad(
  sesiones: readonly SesionMotor[],
  variables: readonly VariableMotor[],
  estructura: EstructuraSemana,
  espacios: readonly EspacioMotor[] = []
): Aviso[] {
  const avisos: Aviso[] = [];
  const totalPeriodos = estructura.dias.length * estructura.periodos.length;
  if (totalPeriodos === 0) {
    return [{ codigo: 'JORNADA_SIN_FRANJAS', mensaje: 'La jornada no tiene franjas de clase o días hábiles definidos.' }];
  }

  const horasPorGrupo = new Map<string, number>();
  const horasPorDocente = new Map<string, number>();
  for (const s of sesiones) {
    if (s.group_id) horasPorGrupo.set(s.group_id, (horasPorGrupo.get(s.group_id) ?? 0) + s.duracion);
    for (const d of s.docente_ids) horasPorDocente.set(d, (horasPorDocente.get(d) ?? 0) + s.duracion);
  }

  for (const [grupo, horas] of horasPorGrupo) {
    if (horas > totalPeriodos) {
      avisos.push({ codigo: 'GRUPO_EXCEDE_PERIODOS', mensaje: `El grupo ${grupo} tiene ${horas} horas y la semana solo ${totalPeriodos} periodos.` });
    }
  }

  // Las horas que piden el mismo conjunto de espacios no pueden pasar de lo que esos espacios dan en una semana. Si alguno
  // admite grupos simultáneos no hay tope por espacio y no se avisa.
  const admiteVarios = new Set(espacios.filter((e) => e.admite_grupos_simultaneos).map((e) => e.id));
  const horasPorEspacios = new Map<string, { ids: string[]; horas: number }>();
  for (const s of sesiones) {
    if (!s.espacios_permitidos || s.espacios_permitidos.length === 0) continue;
    const ids = [...s.espacios_permitidos].sort();
    const clave = ids.join('|');
    horasPorEspacios.set(clave, { ids, horas: (horasPorEspacios.get(clave)?.horas ?? 0) + s.duracion });
  }
  for (const { ids, horas } of horasPorEspacios.values()) {
    if (ids.some((id) => admiteVarios.has(id))) continue;
    if (horas > ids.length * totalPeriodos) {
      avisos.push({
        codigo: 'ESPACIOS_INSUFICIENTES',
        mensaje: `Las clases que piden ${ids.length === 1 ? 'un mismo espacio' : `estos ${ids.length} espacios`} suman ${horas} horas y ${ids.length === 1 ? 'ese espacio solo da' : 'entre todos solo dan'} ${ids.length * totalPeriodos} por semana. Agrega espacios o quita la regla de espacio requerido.`,
      });
    }
  }

  for (const [docente, horas] of horasPorDocente) {
    const sujeto = { group_id: null, grade_id: null, subject_id: null, docente_ids: [docente] };
    const bloqueadas = new Set<string>();
    for (const v of resolverVariables(variables, sujeto)) {
      if (v.tipo !== 'DISPONIBILIDAD' || v.severidad !== 'DURA' || v.docente_ids.length === 0) continue;
      for (const c of v.parametros.celdas) if (c.valor === 'NO_DISPONIBLE') bloqueadas.add(`${c.dia}-${c.periodo}`);
    }
    const libres = totalPeriodos - bloqueadas.size;
    if (horas > libres) {
      avisos.push({ codigo: 'DOCENTE_EXCEDE_DISPONIBILIDAD', mensaje: `El docente ${docente} tiene ${horas} horas y solo ${libres} franjas disponibles.` });
    }
  }
  return avisos;
}
