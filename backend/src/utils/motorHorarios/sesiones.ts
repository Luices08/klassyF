import { Franja } from '../franjas';
import { resolverVariables } from './alcance';
import { AsignacionMotor, Aviso, EstructuraSemana, SesionMotor, VariableDeTipo, VariableMotor } from './tipos';

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
function partirEnBloques(horas: number, bloques: readonly number[] | null, maxBloque: number): { bloques: number[]; cuadra: boolean } {
  if (!bloques || bloques.length === 0) return { bloques: Array.from({ length: horas }, () => 1), cuadra: true };
  const suma = bloques.reduce((s, b) => s + b, 0);
  if (suma === horas && bloques.every((b) => b <= maxBloque)) return { bloques: [...bloques], cuadra: true };

  const tamano = Math.min(Math.max(...bloques), maxBloque);
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
  const maxBloque = Math.max(1, estructura.periodos.length);

  for (const a of asignaciones) {
    if (a.horas_semanales <= 0) continue;
    const sujeto = { group_id: a.group_id, grade_id: a.grade_id, subject_id: a.subject_id, docente_ids: [a.docente_id] };
    const vigentes = resolverVariables(variables, sujeto);
    const distribucion = vigentes.find((v): v is VariableDeTipo<'DISTRIBUCION_BLOQUES'> => v.tipo === 'DISTRIBUCION_BLOQUES');
    const espacio = vigentes.find((v): v is VariableDeTipo<'ESPACIO_REQUERIDO'> => v.tipo === 'ESPACIO_REQUERIDO');

    const { bloques, cuadra } = partirEnBloques(a.horas_semanales, distribucion?.parametros.bloques ?? null, maxBloque);
    if (!cuadra && distribucion) {
      avisos.push({
        codigo: 'BLOQUES_NO_CUADRAN',
        mensaje: `El patrón de bloques [${distribucion.parametros.bloques.join(', ')}] no suma las ${a.horas_semanales} horas de la asignación ${a.id}; se usó [${bloques.join(', ')}].`,
      });
    }

    bloques
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
  estructura: EstructuraSemana
): Aviso[] {
  const avisos: Aviso[] = [];
  const totalPeriodos = estructura.dias.length * estructura.periodos.length;
  if (totalPeriodos === 0) {
    return [{ codigo: 'JORNADA_SIN_FRANJAS', mensaje: 'La jornada no tiene franjas de clase o días hábiles definidos.' }];
  }

  const horasPorGrupo = new Map<string, number>();
  const horasPorDocente = new Map<string, number>();
  const bloquesPorGrupo = new Map<string, number>();
  const bloquesPorDocente = new Map<string, number>();
  for (const s of sesiones) {
    // Solo cuentan los bloques que el descanso no puede partir: los demás caben en cualquier par de periodos seguidos.
    const enteroEnTramo = s.duracion > 1 && resolverVariables(variables, s).some((v) => v.tipo === 'RECREO_NO_INTERRUMPE' && v.severidad === 'DURA');
    if (s.group_id) {
      horasPorGrupo.set(s.group_id, (horasPorGrupo.get(s.group_id) ?? 0) + s.duracion);
      if (enteroEnTramo) bloquesPorGrupo.set(s.group_id, (bloquesPorGrupo.get(s.group_id) ?? 0) + 1);
    }
    for (const d of s.docente_ids) {
      horasPorDocente.set(d, (horasPorDocente.get(d) ?? 0) + s.duracion);
      if (enteroEnTramo) bloquesPorDocente.set(d, (bloquesPorDocente.get(d) ?? 0) + 1);
    }
  }

  // Cuántos bloques dobles caben como máximo en una semana: por día, cada tramo entre descansos admite floor(largo/2).
  const tramos: number[] = [];
  estructura.periodos.forEach((p, i) => {
    if (i === 0 || p.descanso_antes) tramos.push(0);
    tramos[tramos.length - 1] = (tramos[tramos.length - 1] ?? 0) + 1;
  });
  const bloquesPorSemana = estructura.dias.length * tramos.reduce((suma, largo) => suma + Math.floor(largo / 2), 0);
  const revisarBloques = (quien: string, bloques: number) => {
    if (bloques > bloquesPorSemana) {
      avisos.push({
        codigo: 'BLOQUES_NO_CABEN',
        mensaje: `${quien} necesita ${bloques} bloques de 2 o más horas y, como el descanso no puede partirlos, en la semana solo caben ${bloquesPorSemana}. Reparte la carga o cambia el patrón de bloques.`,
      });
    }
  };
  for (const [grupo, bloques] of bloquesPorGrupo) revisarBloques(`El grupo ${grupo}`, bloques);
  for (const [docente, bloques] of bloquesPorDocente) revisarBloques(`El docente ${docente}`, bloques);

  for (const [grupo, horas] of horasPorGrupo) {
    if (horas > totalPeriodos) {
      avisos.push({ codigo: 'GRUPO_EXCEDE_PERIODOS', mensaje: `El grupo ${grupo} tiene ${horas} horas y la semana solo ${totalPeriodos} periodos.` });
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
