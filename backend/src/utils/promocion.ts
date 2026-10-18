import {
  ACCIONES_PERMITIDAS_POR_CONVIVENCIA,
  AccionRegla,
  AccionSinRegla,
  CLAVES_REGLAS_DERIVADAS,
  CLAVE_REGLA_INASISTENCIA,
  CLAVE_REGLA_REPRUEBA_AREAS,
  CLAVE_REGLA_REPRUEBA_ASIGNATURAS,
  CondicionArrastre,
  ConsecuenciaIncumplirArrastre,
  CLAVE_REGLA_IMPRESCINDIBLE_AREAS,
  CLAVE_REGLA_IMPRESCINDIBLE_ASIGNATURAS,
  EfectoImprescindibles,
  EfectoNotaRecuperacion,
  FaltasComputables,
  FiltroCriticidad,
  MAX_CONDICIONES_POR_REGLA,
  MAX_REGLAS_PROMOCION,
  ModoLista,
  MomentoPromocion,
  PATRON_CLAVE_REGLA,
  PRECEDENCIA_ACCIONES,
  ResultadoPromocion,
  TipoCondicion,
  UnidadPromocion,
} from '../constants/promocion';

const EFECTOS_IMPRESCINDIBLES_VALIDOS: readonly string[] = ['NO_PROMUEVE', 'RECUPERA', 'COMISION'];

/** Una condición con la forma única de todas: el tipo dice qué campos usa (`validarPolitica` exige los que le tocan). */
export interface Condicion {
  tipo: TipoCondicion;
  /** Cantidad (asignaturas, áreas, faltas). */
  n?: number | null;
  /** Porcentaje 0–100 (inasistencia). */
  porcentaje?: number | null;
  /** Nota (promedio general). */
  nota?: number | null;
  filtro?: FiltroCriticidad | null;
  /** En conteos de pérdidas con unidad `AMBAS`: cuenta solo asignaturas o solo áreas. Vacío = todas las perdidas. */
  unidad?: 'ASIGNATURA' | 'AREA' | null;
  faltas?: FaltasComputables | null;
  modo?: ModoLista | null;
  subject_ids?: string[];
  area_ids?: string[];
  /** Gravedad mínima de la falta de convivencia (I, II, III). */
  gravedad?: string | null;
}

export interface Regla {
  clave: string;
  nombre: string;
  activa: boolean;
  momentos: MomentoPromocion[];
  /** Vacíos = toda la institución. Con valores, la regla aplica si el grado o su nivel está en la lista. */
  niveles: string[];
  grados_ids: string[];
  condiciones: Condicion[];
  accion: AccionRegla;
}

export interface PoliticaArrastre {
  admite: boolean;
  /** Cuántas asignaturas (o áreas, según la unidad) se pueden deber. */
  max_unidades: number;
  condicion: CondicionArrastre;
  nota_minima: number | null;
  /** Hasta qué periodo del año siguiente se debe cumplir. */
  hasta_periodo: number;
  si_incumple: ConsecuenciaIncumplirArrastre;
}

/** Tarjeta «Inasistencia»: reprobación directa por fallas. El motor la convierte en una regla (`reglasEfectivas`). */
export interface PoliticaInasistencia {
  activa: boolean;
  /** Máximo permitido (0–100); se reprueba al superarlo. */
  porcentaje: number;
  faltas: FaltasComputables;
}

/**
 * Tarjeta «Umbrales»: según cuántas unidades pierde el estudiante. `recuperacion_hasta` = con hasta N unidades tiene derecho a la recuperación
 * final (0 = sin recuperación) y se refleja en M18; desde N+1 reprueba. `null` = el colegio aún no lo configuró por aquí (política anterior).
 */
export interface PoliticaUmbrales {
  recuperacion_hasta: number | null;
  /** Solo con unidad `AMBAS`: con esta cantidad de áreas perdidas reprueba (las asignaturas usan `recuperacion_hasta + 1`). */
  reprueba_desde_areas: number | null;
  efecto_nota_recuperacion: EfectoNotaRecuperacion;
}

export interface PoliticaPromocion {
  unidad: UnidadPromocion;
  /** Con unidad ÁREA: si perder una asignatura del área la da por perdida aunque su nota (por pesos) apruebe. */
  area_pierde_con_asignatura_perdida: boolean;
  asignaturas_criticas_ids: string[];
  areas_criticas_ids: string[];
  asignaturas_arrastrables_ids: string[];
  areas_arrastrables_ids: string[];
  reglas: Regla[];
  inasistencia: PoliticaInasistencia;
  umbrales: PoliticaUmbrales;
  /** Qué pasa con quien pierde una materia o área imprescindible (las «críticas»). `null` = política anterior: no deriva nada. */
  imprescindibles: { efecto: EfectoImprescindibles | null };
  /** Qué hacer con quien pierde algo y no dispara ninguna regla. */
  sin_regla: { cierre: AccionSinRegla; tras_recuperacion: AccionSinRegla };
  arrastre: PoliticaArrastre;
  piar: { derivar_a_comision: boolean };
  titulacion: PoliticaTitulacion;
  texto_siee: string;
}

/**
 * Qué exige el colegio para graduar (la norma fija mínimos, p. ej. 80 horas de servicio social, Res. 4210/1996; cada colegio puede subirlos).
 * Los requisitos bloquean la titulación solo en el grado de titulación; antes de él el servicio social solo avisa (`alerta_desde_grado`).
 */
export interface PoliticaTitulacion {
  /** Número del grado en que se otorga el título (11 en Colombia). */
  grado_titulacion: number;
  servicio_social: { activo: boolean; horas_requeridas: number; alerta_desde_grado: number };
  saber_11: { activo: boolean };
  paz_y_salvo: { activo: boolean };
  /** Certificados de los grados anteriores (propios aprobados o externos recibidos), desde el grado indicado hasta el anterior al de titulación. */
  carpeta_academica: { activo: boolean; desde_grado: number };
}

export function titulacionInicial(): PoliticaTitulacion {
  return {
    grado_titulacion: 11,
    servicio_social: { activo: true, horas_requeridas: 80, alerta_desde_grado: 10 },
    saber_11: { activo: true },
    paz_y_salvo: { activo: true },
    carpeta_academica: { activo: true, desde_grado: 1 },
  };
}

export function politicaInicial(): PoliticaPromocion {
  return {
    unidad: 'ASIGNATURA',
    area_pierde_con_asignatura_perdida: false,
    asignaturas_criticas_ids: [],
    areas_criticas_ids: [],
    asignaturas_arrastrables_ids: [],
    areas_arrastrables_ids: [],
    reglas: [],
    inasistencia: { activa: false, porcentaje: 25, faltas: 'SOLO_INJUSTIFICADAS' },
    umbrales: { recuperacion_hasta: null, reprueba_desde_areas: null, efecto_nota_recuperacion: 'LIMITA_A_APROBATORIA' },
    imprescindibles: { efecto: 'NO_PROMUEVE' },
    sin_regla: { cierre: 'PENDIENTE_RECUPERACION', tras_recuperacion: 'NO_PROMUEVE' },
    arrastre: { admite: false, max_unidades: 1, condicion: 'NINGUNA', nota_minima: null, hasta_periodo: 1, si_incumple: 'SOLO_ALERTA' },
    piar: { derivar_a_comision: false },
    titulacion: titulacionInicial(),
    texto_siee: '',
  };
}

// ---------------------------------------------------------------- validación

const REQUIERE_N: TipoCondicion[] = ['PERDIDAS_AL_MENOS', 'PERDIDAS_COMO_MAXIMO', 'SIN_NOTA_AL_MENOS', 'RECUPERACION_NO_SUPERADA_AL_MENOS', 'FALTAS_CONVIVENCIA_AL_MENOS'];
const REQUIERE_PORCENTAJE: TipoCondicion[] = ['INASISTENCIA_GLOBAL_SUPERA', 'INASISTENCIA_ASIGNATURA_SUPERA'];

function problemaDeCondicion(c: Condicion): string | null {
  if (REQUIERE_N.includes(c.tipo) && !(Number.isInteger(c.n) && (c.n as number) >= 0)) return `La condición «${c.tipo}» necesita una cantidad entera (n).`;
  if (REQUIERE_PORCENTAJE.includes(c.tipo)) {
    if (typeof c.porcentaje !== 'number' || c.porcentaje < 0 || c.porcentaje > 100) return `La condición «${c.tipo}» necesita un porcentaje entre 0 y 100.`;
    if (!c.faltas) return `La condición «${c.tipo}» debe decir qué faltas cuentan (solo injustificadas o todas).`;
  }
  if (c.tipo === 'PROMEDIO_GENERAL_MENOR' && typeof c.nota !== 'number') return 'La condición «PROMEDIO_GENERAL_MENOR» necesita una nota.';
  if (c.tipo === 'PIERDE_ASIGNATURAS' && (!c.subject_ids || c.subject_ids.length === 0 || !c.modo)) return 'Indica qué asignaturas y si basta con una o deben perderse todas.';
  if (c.tipo === 'PIERDE_AREAS' && (!c.area_ids || c.area_ids.length === 0 || !c.modo)) return 'Indica qué áreas y si basta con una o deben perderse todas.';
  if (c.tipo === 'FALTAS_CONVIVENCIA_AL_MENOS' && !c.gravedad) return 'Indica la gravedad mínima de la falta de convivencia.';
  return null;
}

/** Devuelve el primer problema de la política (para responder 400) o null si es coherente. */
export function validarPolitica(p: PoliticaPromocion, ultimoPeriodo?: number): string | null {
  if (p.reglas.length > MAX_REGLAS_PROMOCION) return `Máximo ${MAX_REGLAS_PROMOCION} reglas.`;
  const claves = new Set<string>();
  const ina = p.inasistencia;
  if (ina && ina.activa && (typeof ina.porcentaje !== 'number' || ina.porcentaje < 0 || ina.porcentaje > 100)) return 'El porcentaje máximo de inasistencia debe estar entre 0 y 100.';
  if (p.imprescindibles?.efecto && !EFECTOS_IMPRESCINDIBLES_VALIDOS.includes(p.imprescindibles.efecto)) return 'El efecto de las materias imprescindibles no es válido.';
  const um = p.umbrales;
  if (um) {
    if (um.recuperacion_hasta !== null && (!Number.isInteger(um.recuperacion_hasta) || um.recuperacion_hasta < 0)) return 'Indica con cuántas unidades perdidas se puede recuperar (0 o más).';
    if (um.reprueba_desde_areas !== null) {
      if (p.unidad !== 'AMBAS') return 'El umbral de áreas aparte solo aplica cuando se evalúa por asignaturas y áreas a la vez.';
      if (!Number.isInteger(um.reprueba_desde_areas) || um.reprueba_desde_areas < 1) return 'El umbral de áreas debe ser 1 o más.';
    }
  }
  for (const r of p.reglas) {
    if (CLAVES_REGLAS_DERIVADAS.includes(r.clave)) return `La clave «${r.clave}» está reservada para las reglas automáticas.`;
    if (!PATRON_CLAVE_REGLA.test(r.clave)) return `La clave de la regla «${r.nombre}» no es válida.`;
    if (claves.has(r.clave)) return `La clave «${r.clave}» está repetida.`;
    claves.add(r.clave);
    if (r.momentos.length === 0) return `La regla «${r.nombre}» debe aplicar en al menos un momento.`;
    if (r.condiciones.length === 0) return `La regla «${r.nombre}» necesita al menos una condición.`;
    if (r.condiciones.length > MAX_CONDICIONES_POR_REGLA) return `La regla «${r.nombre}» tiene demasiadas condiciones.`;
    // La recuperación final aún no ocurrió al cerrar: «pendiente de recuperación» solo tiene sentido en ese momento.
    if (r.accion === 'PENDIENTE_RECUPERACION' && r.momentos.some((m) => m !== 'CIERRE')) return `La regla «${r.nombre}» envía a recuperación: solo puede aplicar al cierre.`;
    if (r.condiciones.some((c) => c.tipo === 'FALTAS_CONVIVENCIA_AL_MENOS') && !ACCIONES_PERMITIDAS_POR_CONVIVENCIA.includes(r.accion)) {
      return `La regla «${r.nombre}» usa faltas de convivencia: no puede reprobar el año; solo enviar a comisión o no renovar el cupo.`;
    }
    for (const c of r.condiciones) {
      const problema = problemaDeCondicion(c);
      if (problema) return `Regla «${r.nombre}»: ${problema}`;
    }
  }
  if (p.arrastre.admite) {
    if (!Number.isInteger(p.arrastre.max_unidades) || p.arrastre.max_unidades < 1) return 'El arrastre debe permitir al menos una asignatura pendiente.';
    if (['NOTA_MINIMA_PRIMER_PERIODO'].includes(p.arrastre.condicion) && typeof p.arrastre.nota_minima !== 'number') return 'Indica la nota mínima que se exigirá en el arrastre.';
    if (p.arrastre.hasta_periodo < 1 || (ultimoPeriodo !== undefined && p.arrastre.hasta_periodo > ultimoPeriodo)) return 'El periodo límite del arrastre no existe en el calendario.';
    if (p.asignaturas_arrastrables_ids.length === 0 && p.areas_arrastrables_ids.length === 0) return 'Marca qué asignaturas o áreas se pueden deber (p. ej. educación física).';
  }
  const t = p.titulacion;
  if (!Number.isInteger(t.grado_titulacion) || t.grado_titulacion < 1 || t.grado_titulacion > 11) return 'El grado de titulación debe estar entre 1 y 11.';
  if (t.servicio_social.activo && (!Number.isFinite(t.servicio_social.horas_requeridas) || t.servicio_social.horas_requeridas <= 0)) return 'Indica las horas de servicio social que se exigen.';
  if (t.servicio_social.alerta_desde_grado > t.grado_titulacion) return 'El aviso de servicio social debe empezar en el grado de titulación o antes.';
  if (t.carpeta_academica.desde_grado < -2 || t.carpeta_academica.desde_grado >= t.grado_titulacion) return 'La carpeta académica debe empezar en un grado anterior al de titulación.';
  return null;
}

// ---------------------------------------------------------------- entrada del motor

export type EstadoRecuperacionEntrada = 'SUPERADA' | 'NO_SUPERADA' | 'NO_PRESENTO' | 'PENDIENTE' | null;

export interface AsignaturaEntrada {
  subject_id: string;
  area_id: string;
  nombre: string;
  /** Nota anual antes de la recuperación final; null = faltan notas cerradas. */
  nota_antes: number | null;
  /** Nota anual con la recuperación final ya aplicada (igual a `nota_antes` si no recuperó). */
  nota_final: number | null;
  recuperacion: EstadoRecuperacionEntrada;
  /** % de inasistencia sobre las horas de la asignatura. */
  inasistencia_total_pct: number;
  inasistencia_injustificada_pct: number;
}

export interface AreaEntrada {
  area_id: string;
  nombre: string;
  nota_antes: number | null;
  nota_final: number | null;
  recuperacion: EstadoRecuperacionEntrada;
}

export interface EntradaPromocion {
  grado_id: string;
  nivel: string;
  nota_aprobatoria: number;
  asignaturas: AsignaturaEntrada[];
  areas: AreaEntrada[];
  promedio_general: number | null;
  inasistencia_global_total_pct: number;
  inasistencia_global_injustificada_pct: number;
  /** Faltas de convivencia del año por gravedad ('I' | 'II' | 'III'). */
  faltas_por_gravedad: Record<string, number>;
  tiene_piar: boolean;
  /** M18: ¿hay recuperación final? y cuántas unidades pendientes admite (0 = sin tope). */
  admite_recuperacion_final: boolean;
  max_recuperables: number;
}

export interface UnidadPerdida {
  tipo: UnidadPromocion;
  id: string;
  nombre: string;
  nota: number | null;
  critica: boolean;
  arrastrable: boolean;
}

export interface ReglaDisparada {
  clave: string;
  nombre: string;
  accion: AccionRegla;
}

export interface ResultadoMotor {
  resultado: ResultadoPromocion;
  momento: MomentoPromocion;
  perdidas: UnidadPerdida[];
  /** Lo que debe recuperar (resultado PENDIENTE_RECUPERACION). */
  a_recuperar: UnidadPerdida[];
  /** Lo que se debe llevando al grado siguiente (resultado PROMOVIDO_CON_ARRASTRE). */
  arrastres: UnidadPerdida[];
  sin_nota: string[];
  reglas_disparadas: ReglaDisparada[];
  no_renueva_cupo: boolean;
  /** Explicación en palabras de por qué salió ese resultado, para el acta y la pantalla. */
  motivos: string[];
}

// ---------------------------------------------------------------- cálculo

const notaDe = (u: { nota_antes: number | null; nota_final: number | null }, momento: MomentoPromocion): number | null => (momento === 'CIERRE' ? u.nota_antes : u.nota_final);

function esCritica(subjectId: string, areaId: string, p: PoliticaPromocion): boolean {
  return p.asignaturas_criticas_ids.includes(subjectId) || p.areas_criticas_ids.includes(areaId);
}
function esArrastrable(subjectId: string, areaId: string, p: PoliticaPromocion): boolean {
  return p.asignaturas_arrastrables_ids.includes(subjectId) || p.areas_arrastrables_ids.includes(areaId);
}

/** Las asignaturas y/o áreas que el estudiante tiene perdidas en ese momento, según la unidad de la política. */
export function unidadesPerdidas(e: EntradaPromocion, p: PoliticaPromocion, momento: MomentoPromocion): UnidadPerdida[] {
  const pierde = (nota: number | null) => nota !== null && nota < e.nota_aprobatoria;
  const asignaturasPerdidas = e.asignaturas.filter((a) => pierde(notaDe(a, momento)));
  const comoAsignaturas = (): UnidadPerdida[] =>
    asignaturasPerdidas.map((a) => ({
      tipo: 'ASIGNATURA' as const,
      id: a.subject_id,
      nombre: a.nombre,
      nota: notaDe(a, momento),
      critica: esCritica(a.subject_id, a.area_id, p),
      arrastrable: esArrastrable(a.subject_id, a.area_id, p),
    }));
  const comoAreas = (): UnidadPerdida[] => {
    const areasConAsignaturaPerdida = new Set(asignaturasPerdidas.map((a) => a.area_id));
    return e.areas
      .filter((a) => pierde(notaDe(a, momento)) || (p.area_pierde_con_asignatura_perdida && areasConAsignaturaPerdida.has(a.area_id)))
      .map((a) => ({
        tipo: 'AREA' as const,
        id: a.area_id,
        nombre: a.nombre,
        nota: notaDe(a, momento),
        critica: p.areas_criticas_ids.includes(a.area_id),
        arrastrable: p.areas_arrastrables_ids.includes(a.area_id),
      }));
  };
  if (p.unidad === 'ASIGNATURA') return comoAsignaturas();
  if (p.unidad === 'AREA') return comoAreas();
  return [...comoAsignaturas(), ...comoAreas()];
}

/**
 * Las unidades que cuentan para el tope de recuperación y el arrastre: las de la unidad de la política y, con `AMBAS`, solo las asignaturas
 * (la recuperación final de M18 es por asignatura; las áreas tienen su propio umbral de reprobación).
 */
const unidadesDeTope = (perdidas: UnidadPerdida[], p: PoliticaPromocion): UnidadPerdida[] => (p.unidad === 'AMBAS' ? perdidas.filter((u) => u.tipo === 'ASIGNATURA') : perdidas);

/** Las reglas que salen de las tarjetas «Inasistencia» y «Umbrales», sumadas a las propias del colegio. Pura: no se guardan en `reglas[]`. */
export function reglasEfectivas(p: PoliticaPromocion): Regla[] {
  const derivadas: Regla[] = [];
  const base = { activa: true, momentos: ['CIERRE', 'TRAS_RECUPERACION'] as MomentoPromocion[], niveles: [], grados_ids: [], accion: 'NO_PROMUEVE' as const };
  const hasta = p.umbrales?.recuperacion_hasta ?? null;
  if (hasta !== null && hasta >= 1) {
    if (p.unidad === 'AREA') {
      derivadas.push({ ...base, clave: CLAVE_REGLA_REPRUEBA_AREAS, nombre: `Pierde ${hasta + 1} o más áreas`, condiciones: [{ tipo: 'PERDIDAS_AL_MENOS', n: hasta + 1, filtro: 'TODAS', unidad: 'AREA' }] });
    } else {
      derivadas.push({ ...base, clave: CLAVE_REGLA_REPRUEBA_ASIGNATURAS, nombre: `Pierde ${hasta + 1} o más asignaturas`, condiciones: [{ tipo: 'PERDIDAS_AL_MENOS', n: hasta + 1, filtro: 'TODAS', unidad: 'ASIGNATURA' }] });
    }
  }
  const desdeAreas = p.umbrales?.reprueba_desde_areas ?? null;
  if (p.unidad === 'AMBAS' && desdeAreas !== null) {
    derivadas.push({ ...base, clave: CLAVE_REGLA_REPRUEBA_AREAS, nombre: `Pierde ${desdeAreas} o más áreas`, condiciones: [{ tipo: 'PERDIDAS_AL_MENOS', n: desdeAreas, filtro: 'TODAS', unidad: 'AREA' }] });
  }
  const efecto = p.imprescindibles?.efecto ?? null;
  if (efecto === 'NO_PROMUEVE' || efecto === 'COMISION') {
    const reglaImprescindible = { ...base, accion: efecto === 'NO_PROMUEVE' ? ('NO_PROMUEVE' as const) : ('ENVIA_A_COMISION' as const) };
    if (p.unidad !== 'AREA' && p.asignaturas_criticas_ids.length > 0) {
      derivadas.push({ ...reglaImprescindible, clave: CLAVE_REGLA_IMPRESCINDIBLE_ASIGNATURAS, nombre: 'Pierde una asignatura imprescindible', condiciones: [{ tipo: 'PIERDE_ASIGNATURAS', modo: 'ALGUNA', subject_ids: [...p.asignaturas_criticas_ids] }] });
    }
    if (p.unidad !== 'ASIGNATURA' && p.areas_criticas_ids.length > 0) {
      derivadas.push({ ...reglaImprescindible, clave: CLAVE_REGLA_IMPRESCINDIBLE_AREAS, nombre: 'Pierde un área imprescindible', condiciones: [{ tipo: 'PIERDE_AREAS', modo: 'ALGUNA', area_ids: [...p.areas_criticas_ids] }] });
    }
  }
  if (p.inasistencia?.activa) {
    derivadas.push({
      ...base,
      clave: CLAVE_REGLA_INASISTENCIA,
      nombre: `Inasistencia superior al ${p.inasistencia.porcentaje} %`,
      condiciones: [{ tipo: 'INASISTENCIA_GLOBAL_SUPERA', porcentaje: p.inasistencia.porcentaje, faltas: p.inasistencia.faltas }],
    });
  }
  return [...derivadas, ...p.reglas];
}

const cuenta = (lista: UnidadPerdida[], filtro: FiltroCriticidad | null | undefined, unidad?: 'ASIGNATURA' | 'AREA' | null): number => {
  const de = unidad ? lista.filter((u) => u.tipo === unidad) : lista;
  return filtro === 'CRITICAS' ? de.filter((u) => u.critica).length : filtro === 'NO_CRITICAS' ? de.filter((u) => !u.critica).length : de.length;
};

const GRAVEDAD_ORDEN = ['I', 'II', 'III'];

function cumpleCondicion(c: Condicion, e: EntradaPromocion, perdidas: UnidadPerdida[], momento: MomentoPromocion): boolean {
  switch (c.tipo) {
    case 'PERDIDAS_AL_MENOS':
      return cuenta(perdidas, c.filtro, c.unidad) >= (c.n as number);
    case 'PERDIDAS_COMO_MAXIMO':
      // «Como máximo n» exige además que haya perdido algo: de lo contrario toda regla de arrastre se cumpliría con cero.
      return cuenta(perdidas, c.filtro, c.unidad) >= 1 && cuenta(perdidas, c.filtro, c.unidad) <= (c.n as number) && (c.filtro !== 'NO_CRITICAS' || perdidas.every((u) => !u.critica));
    case 'PIERDE_ASIGNATURAS': {
      const perdidasIds = new Set(e.asignaturas.filter((a) => (notaDe(a, momento) ?? Infinity) < e.nota_aprobatoria).map((a) => a.subject_id));
      const lista = c.subject_ids ?? [];
      return c.modo === 'TODAS' ? lista.every((id) => perdidasIds.has(id)) : lista.some((id) => perdidasIds.has(id));
    }
    case 'PIERDE_AREAS': {
      const perdidasIds = new Set(e.areas.filter((a) => (notaDe(a, momento) ?? Infinity) < e.nota_aprobatoria).map((a) => a.area_id));
      const lista = c.area_ids ?? [];
      return c.modo === 'TODAS' ? lista.every((id) => perdidasIds.has(id)) : lista.some((id) => perdidasIds.has(id));
    }
    case 'INASISTENCIA_GLOBAL_SUPERA':
      return (c.faltas === 'TODAS' ? e.inasistencia_global_total_pct : e.inasistencia_global_injustificada_pct) > (c.porcentaje as number);
    case 'INASISTENCIA_ASIGNATURA_SUPERA':
      return e.asignaturas.some((a) => (c.faltas === 'TODAS' ? a.inasistencia_total_pct : a.inasistencia_injustificada_pct) > (c.porcentaje as number));
    case 'PROMEDIO_GENERAL_MENOR':
      return e.promedio_general !== null && e.promedio_general < (c.nota as number);
    case 'SIN_NOTA_AL_MENOS':
      return e.asignaturas.filter((a) => notaDe(a, momento) === null).length >= (c.n as number);
    case 'RECUPERACION_NO_SUPERADA_AL_MENOS':
      return e.asignaturas.filter((a) => a.recuperacion === 'NO_SUPERADA' || a.recuperacion === 'NO_PRESENTO').length >= (c.n as number);
    case 'FALTAS_CONVIVENCIA_AL_MENOS': {
      const desde = Math.max(0, GRAVEDAD_ORDEN.indexOf(c.gravedad ?? 'I'));
      const total = GRAVEDAD_ORDEN.slice(desde).reduce((suma, g) => suma + (e.faltas_por_gravedad[g] ?? 0), 0);
      return total >= (c.n as number);
    }
    case 'TIENE_PIAR':
      return e.tiene_piar;
  }
}

const reglaAplicaAlGrado = (r: Regla, e: EntradaPromocion): boolean =>
  (r.niveles.length === 0 && r.grados_ids.length === 0) || r.grados_ids.includes(e.grado_id) || r.niveles.includes(e.nivel);

const vacioResultado = (momento: MomentoPromocion): ResultadoMotor => ({
  resultado: 'PROMOVIDO',
  momento,
  perdidas: [],
  a_recuperar: [],
  arrastres: [],
  sin_nota: [],
  reglas_disparadas: [],
  no_renueva_cupo: false,
  motivos: [],
});

const RESULTADO_DE_ACCION: Record<Exclude<AccionRegla, 'NO_RENUEVA_CUPO'>, ResultadoPromocion> = {
  PROPONE_RETIRO: 'RETIRO_PROPUESTO',
  NO_PROMUEVE: 'NO_PROMOVIDO',
  ENVIA_A_COMISION: 'EN_COMISION',
  PENDIENTE_RECUPERACION: 'PENDIENTE_RECUPERACION',
};

/**
 * Decide la situación académica de un estudiante. Pura: no lee la base ni el reloj. Orden:
 * 1) reglas disparadas (gana la de mayor precedencia); 2) sin regla: arrastre si procede y, si no, la acción por defecto de la política;
 * 3) PIAR deriva a comisión si la política lo pide; 4) un estudiante sin nota que ninguna regla decidió queda INCOMPLETO.
 */
export function evaluarPromocion(e: EntradaPromocion, p: PoliticaPromocion, momento: MomentoPromocion): ResultadoMotor {
  const salida = vacioResultado(momento);
  salida.perdidas = unidadesPerdidas(e, p, momento);
  salida.sin_nota = e.asignaturas.filter((a) => notaDe(a, momento) === null).map((a) => a.nombre);

  for (const r of reglasEfectivas(p)) {
    if (!r.activa || !r.momentos.includes(momento) || !reglaAplicaAlGrado(r, e)) continue;
    if (r.condiciones.every((c) => cumpleCondicion(c, e, salida.perdidas, momento))) salida.reglas_disparadas.push({ clave: r.clave, nombre: r.nombre, accion: r.accion });
  }
  salida.no_renueva_cupo = salida.reglas_disparadas.some((r) => r.accion === 'NO_RENUEVA_CUPO');

  const decisivas = salida.reglas_disparadas.filter((r) => r.accion !== 'NO_RENUEVA_CUPO');
  const ganadora = PRECEDENCIA_ACCIONES.map((a) => decisivas.find((r) => r.accion === a)).find((r) => r !== undefined);
  const tieneRecuperable = momento === 'CIERRE' && e.admite_recuperacion_final && (e.max_recuperables === 0 || unidadesDeTope(salida.perdidas, p).length <= e.max_recuperables);

  let resultado: ResultadoPromocion | null = null;
  let porRegla = false;
  if (ganadora && ganadora.accion !== 'NO_RENUEVA_CUPO') {
    // Una regla que manda a recuperar no puede cumplirse si la recuperación no existe o la persona excede su tope: pasa a la acción por defecto.
    if (ganadora.accion === 'PENDIENTE_RECUPERACION' && !tieneRecuperable) resultado = null;
    else {
      resultado = RESULTADO_DE_ACCION[ganadora.accion];
      porRegla = true;
      salida.motivos.push(`Regla «${ganadora.nombre}».`);
    }
  }

  if (resultado === null) {
    if (salida.perdidas.length === 0) {
      const recupero = momento === 'TRAS_RECUPERACION' && unidadesPerdidas(e, p, 'CIERRE').length > 0;
      resultado = recupero ? 'PROMOVIDO_POR_RECUPERACION' : 'PROMOVIDO';
      salida.motivos.push(recupero ? 'Superó la recuperación final.' : 'Aprobó todo.');
    } else if (momento === 'CIERRE') {
      const accion = tieneRecuperable || p.sin_regla.cierre !== 'PENDIENTE_RECUPERACION' ? p.sin_regla.cierre : p.sin_regla.tras_recuperacion;
      resultado = RESULTADO_DE_ACCION[accion];
      salida.motivos.push(`Pierde ${salida.perdidas.length} sin que una regla lo decida: se aplica la acción por defecto.`);
    } else if (p.arrastre.admite && unidadesDeTope(salida.perdidas, p).length <= p.arrastre.max_unidades && unidadesDeTope(salida.perdidas, p).every((u) => u.arrastrable)) {
      resultado = 'PROMOVIDO_CON_ARRASTRE';
      salida.motivos.push('Debe solo asignaturas que el colegio permite arrastrar.');
    } else {
      resultado = RESULTADO_DE_ACCION[p.sin_regla.tras_recuperacion];
      salida.motivos.push(`Sigue perdiendo ${salida.perdidas.length} tras la recuperación.`);
    }
  }

  if (p.piar.derivar_a_comision && e.tiene_piar && ['NO_PROMOVIDO', 'PENDIENTE_RECUPERACION'].includes(resultado)) {
    resultado = 'EN_COMISION';
    salida.motivos.push('Tiene ajustes razonables (PIAR): la comisión decide.');
  }

  const sinNotaSinDecidir = salida.sin_nota.length > 0 && !(porRegla && ['RETIRO_PROPUESTO', 'NO_PROMOVIDO', 'EN_COMISION'].includes(resultado));
  if (sinNotaSinDecidir) {
    resultado = 'INCOMPLETO';
    salida.motivos.push(`Faltan notas anuales: ${salida.sin_nota.join(', ')}.`);
  }

  salida.resultado = resultado;
  if (resultado === 'PENDIENTE_RECUPERACION') salida.a_recuperar = unidadesDeTope(salida.perdidas, p).length > 0 ? unidadesDeTope(salida.perdidas, p) : salida.perdidas;
  if (resultado === 'PROMOVIDO_CON_ARRASTRE') salida.arrastres = unidadesDeTope(salida.perdidas, p);
  return salida;
}

export interface ConceptoOficial {
  concepto: 'APROBO' | 'NO_APROBO';
  /** Frase para el certificado: «APROBÓ el grado Séptimo y es PROMOVIDO al grado Octavo». */
  texto: string;
}

/**
 * El concepto que consume M26 a partir del resultado del cierre. Solo un resultado FINAL lo tiene: pendiente de recuperación, en comisión,
 * retiro propuesto o incompleto devuelven null (no se expide como oficial algo que aún se puede decidir).
 */
export function conceptoOficial(resultado: ResultadoPromocion, grado: string, siguiente: string | null, pendientes: readonly string[] = []): ConceptoOficial | null {
  if (resultado === 'NO_PROMOVIDO') return { concepto: 'NO_APROBO', texto: `NO APROBÓ el grado ${grado}` };
  if (resultado !== 'PROMOVIDO' && resultado !== 'PROMOVIDO_POR_RECUPERACION' && resultado !== 'PROMOVIDO_CON_ARRASTRE') return null;
  const base = siguiente ? `APROBÓ el grado ${grado} y es PROMOVIDO al grado ${siguiente}` : `APROBÓ el grado ${grado}`;
  const arrastre = resultado === 'PROMOVIDO_CON_ARRASTRE' && pendientes.length > 0 ? `, con pendiente: ${pendientes.join(', ')}` : '';
  return { concepto: 'APROBO', texto: base + arrastre };
}
