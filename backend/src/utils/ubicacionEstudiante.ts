import { ESTADOS_MATRICULA_VIVOS, EstadoMatricula } from '../constants/enums';
import { ResultadoPromocion } from '../constants/promocion';
import { destinoDeRollover } from './rollover';

// Funciones puras de «en qué grado le toca matricularse a cada estudiante». El nivel NO se guarda: se deriva de lo que el sistema ya sabe
// (el cierre de promoción de M19 y las matrículas anteriores), así no hay un dato más que mantener ni que se desfase.

export type LugarUbicacion = 'GRADO' | 'EGRESADO' | 'SIN_GRADO';

/**
 * De dónde sale la ubicación:
 * - MATRICULA_ACTUAL: ya está matriculado este año en ese grado.
 * - RETIRO_DEL_ANIO: se retiró este año de ese grado; el reingreso vuelve ahí.
 * - PROMOCION: el cierre de M19 del año anterior decidió el grado.
 * - RETIRO_PREVIO: se retiró en un año anterior sin terminarlo; vuelve a ese grado.
 * - PROPUESTA: su año anterior no tiene cierre de promoción; se propone el grado siguiente y secretaría lo confirma.
 * - PERFIL_GRADUADO: su expediente (M03) figura GRADUADO.
 * - SIN_HISTORIAL: no hay matrículas anteriores en el sistema.
 */
export type FuenteUbicacion = 'MATRICULA_ACTUAL' | 'RETIRO_DEL_ANIO' | 'PROMOCION' | 'RETIRO_PREVIO' | 'PROPUESTA' | 'PERFIL_GRADUADO' | 'SIN_HISTORIAL';

export interface PuestoSegunHistorial {
  lugar: LugarUbicacion;
  /** `Grade.numero` del grado que le corresponde (solo si `lugar` es GRADO). */
  grado_numero: number | null;
  fuente: FuenteUbicacion;
  aviso: string;
}

export interface DatosUbicacion {
  /** La matrícula del año de trabajo: la viva o, si no hay, la retirada más reciente. */
  matriculaDelAnio: { gradoNumero: number; estado: EstadoMatricula } | null;
  /** La última matrícula cursada en un año anterior (sin contar las anuladas ni las que nunca se legalizaron), con el cierre de M19 de ese año. */
  previa: { gradoNumero: number; estado: EstadoMatricula; resultado: ResultadoPromocion | null; noRenueva: boolean } | null;
  /** `Grade.numero` de los grados que existen: dice si hay uno siguiente. */
  gradosExistentes: ReadonlySet<number>;
  perfilGraduado: boolean;
}

export interface Ubicacion {
  /** Dónde se le busca hoy (la pestaña): su grado si ya está matriculado o se retiró este año, si no el que dice su historial. */
  lugar: LugarUbicacion;
  grado_numero: number | null;
  /** Lo que dice su historial; difiere de lo anterior si lo matricularon en un grado distinto (p. ej. promovido por decisión). */
  esperado: { lugar: LugarUbicacion; grado_numero: number | null };
  difiere: boolean;
  /** El último grado que cursó antes del año de trabajo: sirve para listar también a quienes repiten. */
  ultimo_grado_cursado: number | null;
  fuente: FuenteUbicacion;
  aviso: string;
}

export function esperadoPorHistorial(d: Pick<DatosUbicacion, 'previa' | 'gradosExistentes' | 'perfilGraduado'>): PuestoSegunHistorial {
  if (d.perfilGraduado) return { lugar: 'EGRESADO', grado_numero: null, fuente: 'PERFIL_GRADUADO', aviso: 'Su expediente figura como graduado.' };
  const previa = d.previa;
  if (!previa) {
    return { lugar: 'SIN_GRADO', grado_numero: null, fuente: 'SIN_HISTORIAL', aviso: 'No tiene matrículas anteriores en el sistema: se declara su último grado aprobado al matricular.' };
  }
  if (previa.estado === 'RETIRADO') {
    return { lugar: 'GRADO', grado_numero: previa.gradoNumero, fuente: 'RETIRO_PREVIO', aviso: 'Se retiró sin terminar ese grado: vuelve a cursarlo.' };
  }
  const hayGradoSiguiente = d.gradosExistentes.has(previa.gradoNumero + 1);
  if (previa.resultado !== null) {
    // `no_renueva_cupo` no cambia el grado, solo se avisa: es una decisión de permanencia, no académica.
    const { destino } = destinoDeRollover({ resultado: previa.resultado, no_renueva_cupo: false, hay_grado_siguiente: hayGradoSiguiente });
    const aviso = previa.noRenueva ? 'Una regla del colegio dispuso no renovar su cupo.' : '';
    if (destino === 'GRADO_SIGUIENTE') return { lugar: 'GRADO', grado_numero: previa.gradoNumero + 1, fuente: 'PROMOCION', aviso };
    if (destino === 'MISMO_GRADO') return { lugar: 'GRADO', grado_numero: previa.gradoNumero, fuente: 'PROMOCION', aviso: aviso || 'No fue promovido: repite el grado.' };
    if (destino === 'TERMINA_CICLO') return { lugar: 'EGRESADO', grado_numero: null, fuente: 'PROMOCION', aviso: aviso || 'Terminó el último grado.' };
  }
  // Sin cierre final (o con uno que aún espera recuperación o comisión): se propone el siguiente y la secretaría lo confirma con el certificado.
  const aviso = 'Su grado anterior no tiene cierre de promoción: se propone el siguiente, confírmalo con el boletín o el certificado.';
  if (hayGradoSiguiente) return { lugar: 'GRADO', grado_numero: previa.gradoNumero + 1, fuente: 'PROPUESTA', aviso };
  return { lugar: 'EGRESADO', grado_numero: null, fuente: 'PROPUESTA', aviso: 'Cursó el último grado sin cierre de promoción: confirma si se graduó o repite.' };
}

export function ubicarEstudiante(d: DatosUbicacion): Ubicacion {
  const historial = esperadoPorHistorial(d);
  const esperado = { lugar: historial.lugar, grado_numero: historial.grado_numero };
  const ultimo = d.previa?.gradoNumero ?? null;
  const m = d.matriculaDelAnio;

  if (m && ESTADOS_MATRICULA_VIVOS.includes(m.estado)) {
    const difiere = !(historial.lugar === 'GRADO' && historial.grado_numero === m.gradoNumero) && historial.lugar !== 'SIN_GRADO';
    return {
      lugar: 'GRADO',
      grado_numero: m.gradoNumero,
      esperado,
      difiere,
      ultimo_grado_cursado: ultimo,
      fuente: 'MATRICULA_ACTUAL',
      aviso: difiere ? 'Está matriculado en un grado distinto al que indica su historial.' : '',
    };
  }
  if (m && m.estado === 'RETIRADO') {
    // La decisión del colegio de dónde matricularlo prevalece sobre el historial: el reingreso vuelve a ese mismo grado.
    return {
      lugar: 'GRADO',
      grado_numero: m.gradoNumero,
      esperado: { lugar: 'GRADO', grado_numero: m.gradoNumero },
      difiere: false,
      ultimo_grado_cursado: ultimo,
      fuente: 'RETIRO_DEL_ANIO',
      aviso: 'Se retiró este año de ese grado: vuelve como reingreso.',
    };
  }
  return { lugar: historial.lugar, grado_numero: historial.grado_numero, esperado, difiere: false, ultimo_grado_cursado: ultimo, fuente: historial.fuente, aviso: historial.aviso };
}

export type VeredictoDeGrado =
  /** No hay con qué comparar (sin historial y sin grado declarado): no se pide motivo. */
  | { resultado: 'SIN_REFERENCIA' }
  | { resultado: 'COINCIDE' }
  | { resultado: 'DIFIERE'; esperado: { lugar: 'GRADO' | 'EGRESADO'; grado_numero: number | null } };

/**
 * Compara el grado elegido para matricular con lo que dice el historial o, si se declaró, con el último grado aprobado (que manda: es lo que
 * dice el certificado en mano). Solo advierte: quien decide matricular en otro grado (p. ej. promovido por decisión) escribe el motivo.
 */
export function compararGradoElegido(args: {
  gradoElegido: number;
  esperado: { lugar: LugarUbicacion; grado_numero: number | null };
  ultimoGradoAprobadoDeclarado?: number | null;
  gradosExistentes: ReadonlySet<number>;
}): VeredictoDeGrado {
  const { gradoElegido, ultimoGradoAprobadoDeclarado: declarado } = args;
  let esperado = args.esperado;
  if (declarado !== null && declarado !== undefined) {
    esperado = args.gradosExistentes.has(declarado + 1) ? { lugar: 'GRADO', grado_numero: declarado + 1 } : { lugar: 'EGRESADO', grado_numero: null };
  }
  if (esperado.lugar === 'SIN_GRADO') return { resultado: 'SIN_REFERENCIA' };
  if (esperado.lugar === 'GRADO' && esperado.grado_numero === gradoElegido) return { resultado: 'COINCIDE' };
  return { resultado: 'DIFIERE', esperado: { lugar: esperado.lugar, grado_numero: esperado.grado_numero } };
}
