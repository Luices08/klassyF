import { METADATOS_VARIABLE_HORARIO } from '../../constants/horarios';
import { SujetoVariable, VariableMotor } from './tipos';

export function coincideAlcance(variable: VariableMotor, sujeto: SujetoVariable): boolean {
  const { alcance } = variable;
  if (alcance.tipo === 'GLOBAL') return true;
  return sujeto.grade_id !== null && alcance.grade_ids.includes(sujeto.grade_id);
}

export function aplicaA(variable: VariableMotor, sujeto: SujetoVariable): boolean {
  if (!coincideAlcance(variable, sujeto)) return false;
  if (variable.asignatura_ids.length > 0 && (sujeto.subject_id === null || !variable.asignatura_ids.includes(sujeto.subject_id))) {
    return false;
  }
  if (variable.docente_ids.length > 0 && !sujeto.docente_ids.some((d) => variable.docente_ids.includes(d))) return false;
  return true;
}

/**
 * Qué tan puntual es una variable, en este orden: por grados gana a global; nombrar docentes y luego asignaturas gana
 * a "todos"; y entre dos por grados, la de menos grados (ej. "solo 11°" gana a "10° y 11°").
 */
export function especificidad(variable: VariableMotor): number {
  const { alcance } = variable;
  const porGrados = alcance.tipo === 'GRADOS' ? 1000 + 199 - Math.min(alcance.grade_ids.length, 199) : 0;
  return 1000 + porGrados + (variable.docente_ids.length > 0 ? 400 : 0) + (variable.asignatura_ids.length > 0 ? 200 : 0);
}

/** Una excepción sin asignaturas cubre todas; con asignaturas, solo variables que nombran un subconjunto de ellas. */
function excepcionCubre(excepcion: VariableMotor, variable: VariableMotor): boolean {
  if (especificidad(excepcion) < especificidad(variable)) return false;
  if (excepcion.asignatura_ids.length === 0) return true;
  return variable.asignatura_ids.length > 0 && variable.asignatura_ids.every((a) => excepcion.asignatura_ids.includes(a));
}

/**
 * Variables que efectivamente rigen a un sujeto (una sesión o un docente), aplicando la cascada:
 * 1. se descartan las que no le aplican por alcance/asignatura/docente;
 * 2. una excepción anula a las de su tipo igual o menos específicas que cubre;
 * 3. en tipos de valor único queda solo la más específica (empate: la última de la lista, que el servicio entrega
 *    ordenada por fecha de actualización).
 */
export function resolverVariables(variables: readonly VariableMotor[], sujeto: SujetoVariable): VariableMotor[] {
  const aplicables = variables.filter((v) => aplicaA(v, sujeto));
  const excepciones = aplicables.filter((v) => v.es_excepcion);
  const vigentes = aplicables.filter((v) => !v.es_excepcion && !excepciones.some((e) => e.tipo === v.tipo && excepcionCubre(e, v)));

  const ganadoraPorTipo = new Map<string, VariableMotor>();
  const resultado: VariableMotor[] = [];
  for (const v of vigentes) {
    if (!METADATOS_VARIABLE_HORARIO[v.tipo].valorUnico) {
      resultado.push(v);
      continue;
    }
    const actual = ganadoraPorTipo.get(v.tipo);
    if (!actual || especificidad(v) >= especificidad(actual)) ganadoraPorTipo.set(v.tipo, v);
  }
  return [...resultado, ...ganadoraPorTipo.values()];
}
