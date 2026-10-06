import { NIVELES_EDUCATIVOS, NivelEducativo, TipoAsignacionDocente } from '../../../constants/enums';

export type EstadoCarga = 'SIN_CARGA' | 'SUB_CARGA' | 'NORMAL' | 'SOBRE_CARGA';

export type LimitesCarga = Record<NivelEducativo, number>;

export interface EntradaDiagnosticoCarga {
  horasPorNivel: Partial<Record<NivelEducativo, number>>;
  /** Horas que no pertenecen a un nivel (proyectos, comisiones): se miden contra el tope promedio. */
  horasOtras: number;
  limites: LimitesCarga;
  /** Holgura bajo el tope antes de marcar subcarga; es configuración institucional. */
  toleranciaSubcargaHoras: number;
}

export interface DiagnosticoCarga {
  nivel_predominante: NivelEducativo | 'MULTINIVEL' | null;
  tope_horas: number | null;
  /** 1 = 100% de la jornada lectiva. Null cuando no hay clases contra las cuales medir. */
  fraccion_carga: number | null;
  estado_carga: EstadoCarga;
}

const EPSILON = 1e-9;

/**
 * Mide la carga de un docente como fracción de su jornada lectiva: cada nivel pesa
 * horas_del_nivel / tope_del_nivel, de modo que 14 h de Primaria + 10 h de Secundaria se evalúan
 * contra 25 h y 22 h respectivamente, y no contra el tope de un solo nivel. Con un único nivel
 * equivale a horas / tope. Sin horas por nivel no hay contra qué medir: no se supone ninguno.
 */
export function diagnosticarCarga({
  horasPorNivel,
  horasOtras,
  limites,
  toleranciaSubcargaHoras,
}: EntradaDiagnosticoCarga): DiagnosticoCarga {
  const niveles = NIVELES_EDUCATIVOS.filter((nivel) => (horasPorNivel[nivel] ?? 0) > 0);

  if (niveles.length === 0) {
    return { nivel_predominante: null, tope_horas: null, fraccion_carga: null, estado_carga: 'SIN_CARGA' };
  }

  const horasPorNivelTotal = niveles.reduce((suma, nivel) => suma + (horasPorNivel[nivel] ?? 0), 0);
  const horasTotales = horasPorNivelTotal + horasOtras;
  const topePromedio = niveles.reduce((suma, nivel) => suma + limites[nivel], 0) / niveles.length;

  const fraccion =
    niveles.reduce((suma, nivel) => suma + (horasPorNivel[nivel] ?? 0) / limites[nivel], 0) +
    horasOtras / topePromedio;
  const topeEquivalente = horasTotales / fraccion;

  let estado: EstadoCarga = 'NORMAL';
  if (fraccion > 1 + EPSILON) estado = 'SOBRE_CARGA';
  else if (fraccion < 1 - toleranciaSubcargaHoras / topeEquivalente - EPSILON) estado = 'SUB_CARGA';

  const unico = niveles.length === 1 ? niveles[0] : undefined;
  return {
    nivel_predominante: unico ?? 'MULTINIVEL',
    tope_horas: Math.round(topeEquivalente),
    fraccion_carga: fraccion,
    estado_carga: estado,
  };
}

export interface AsignacionParaCarga {
  tipo_asignacion: TipoAsignacionDocente;
  horas_semanales: number;
  /** Nivel del grado del grupo; las asignaciones sin grupo (proyectos) no lo tienen. */
  nivel?: NivelEducativo;
}

export interface ResumenCargaDocente extends DiagnosticoCarga {
  horas_clase: number;
  horas_direccion: number;
  horas_proyectos: number;
  tiene_direccion_grupo: boolean;
  horas_totales: number;
}

/**
 * Las horas de una dirección de grupo las fija quien la asigna (0 = no suma, el valor por defecto):
 * cuando suman, cuentan en el nivel del grupo dirigido igual que una clase, no como horas sueltas.
 */
export function resumirCargaDocente(
  asignaciones: AsignacionParaCarga[],
  limites: LimitesCarga,
  toleranciaSubcargaHoras: number
): ResumenCargaDocente {
  let horasClase = 0;
  let horasDireccion = 0;
  let horasProyectos = 0;
  let tieneDireccionGrupo = false;
  const horasPorNivel: Partial<Record<NivelEducativo, number>> = {};
  let horasOtras = 0;

  for (const a of asignaciones) {
    if (a.tipo_asignacion === 'CLASE') horasClase += a.horas_semanales;
    else if (a.tipo_asignacion === 'DIRECCION_GRUPO') {
      horasDireccion += a.horas_semanales;
      tieneDireccionGrupo = true;
    } else horasProyectos += a.horas_semanales;

    const porNivel = a.tipo_asignacion === 'CLASE' || a.tipo_asignacion === 'DIRECCION_GRUPO';
    if (porNivel && a.nivel) horasPorNivel[a.nivel] = (horasPorNivel[a.nivel] ?? 0) + a.horas_semanales;
    else horasOtras += a.horas_semanales;
  }

  return {
    horas_clase: horasClase,
    horas_direccion: horasDireccion,
    horas_proyectos: horasProyectos,
    tiene_direccion_grupo: tieneDireccionGrupo,
    horas_totales: horasClase + horasDireccion + horasProyectos,
    ...diagnosticarCarga({ horasPorNivel, horasOtras, limites, toleranciaSubcargaHoras }),
  };
}
