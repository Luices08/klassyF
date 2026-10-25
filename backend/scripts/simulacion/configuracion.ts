/**
 * Configuración de la simulación (un JSON). Todo número del colegio simulado vive aquí, no en el código: sedes, franjas,
 * plan de estudios, docentes, calendario, escala, políticas y la matriz de perfiles por grado.
 */
import fs from 'fs';
import path from 'path';
import Joi from 'joi';
import { NIVELES_DESEMPENO, NIVELES_EDUCATIVOS, TIPOS_ESPACIO } from '../../src/constants/enums';
import type { Gravedad, ParametrosAsistencia, ParametrosConvivencia } from './logica/asistencia';

export type TipoNota = 'CRITICA' | 'MODERADA' | 'BLANDA';
export type NombreJornada = 'MANANA' | 'UNICA' | 'TARDE';

export interface FranjaConfig {
  nombre: string;
  tipo: 'CLASE' | 'DESCANSO';
  inicio: string;
  fin: string;
}

export interface JornadaConfig {
  nombre: NombreJornada;
  inicio: string;
  fin: string;
  dias: number[];
  franjas: FranjaConfig[];
}

export interface SedeConfig {
  clave: string;
  nombre: string;
  dane: string;
  direccion: string;
  telefono: string;
  es_principal: boolean;
  jornadas: JornadaConfig[];
}

export interface AsignaturaConfig {
  clave: string;
  nombre: string;
  abreviatura: string;
  niveles: string[];
  tipo_nota: TipoNota;
}

export interface AreaConfig {
  codigo: string;
  nombre: string;
  asignaturas: AsignaturaConfig[];
}

export interface PlanConfig {
  grados: number[];
  asignaturas: Record<string, number>;
  ponderaciones?: Array<{ area: string; asignaturas: Record<string, number> }>;
}

export interface GrupoConfig {
  grado: number;
  sede: string;
  jornada: NombreJornada;
  nomenclaturas: string[];
  cupo: number;
  estudiantes: [number, number];
}

export interface PlazaDocente {
  clave: string;
  sede: string;
  /** Titular: se queda con un grupo entero (todas las asignaturas que puede dictar en él) y lo dirige. */
  titular?: boolean;
  puede: Array<{ asignaturas: string[]; grados?: number[] }>;
}

export interface CeldasConfig {
  dias: number[];
  periodos: number[];
}

export interface VariableHorarioConfig {
  jornada: string;
  descripcion: string;
  tipo: 'DISPONIBILIDAD' | 'DISTRIBUCION_BLOQUES';
  grados?: number[];
  asignaturas?: string[];
  docentes?: string[];
  bloques?: number[];
  no_disponible?: CeldasConfig[];
  /** Lo contrario de `no_disponible`: todas las demás franjas de la jornada quedan no disponibles. */
  solo_disponible?: CeldasConfig[];
}

export interface PeriodoConfig {
  numero: number;
  nombre: string;
  porcentaje: number;
  inicio: string;
  fin: string;
}

export interface ConfigSimulacion {
  version: 1;
  semilla: number;
  anios: number[];
  dominio_correo: string;
  inicio_simulacion: string;
  /** Hasta qué día se simula (AAAA-MM-DD). Sin él, hasta hoy; un año que no termina antes del corte queda abierto. */
  fecha_corte?: string;
  admin: { nombre: string; apellido: string; numero_documento: string; email: string };
  institucion: {
    nombre: string;
    dane: string;
    nit: string;
    resolucion: string;
    ciudad: string;
    departamento: string;
    modalidad: 'PRESENCIAL' | 'VIRTUAL';
    politica_aforo_aula: 'BLOQUEAR' | 'ADVERTIR';
    titulo_bachiller: string;
  };
  sedes: SedeConfig[];
  plantilla_franjas: Array<{ nombre: string; tipo: 'CLASE' | 'DESCANSO'; duracion_min: number }>;
  grados_activos: number[];
  areas: AreaConfig[];
  plan_estudios: PlanConfig[];
  limites_horas_plan: Record<string, number>;
  grupos: GrupoConfig[];
  espacios_extra: Array<{ sede: string; nombre: string; tipo: string; capacidad: number }>;
  personal: Array<{ clave: string; rol: string; sedes: string[]; genero: 'M' | 'F' }>;
  docentes: { horas_min: number; horas_max: number; tolerancia_subcarga_horas: number; plazas: PlazaDocente[] };
  horarios: { orden: string[]; intentos: number; tiempo_max_ms: number; variables: VariableHorarioConfig[] };
  calendario: {
    calendario: 'A' | 'B';
    inicio_anio: string;
    fin_anio: string;
    periodos: PeriodoConfig[];
    no_lectivos: Array<{ tipo: string; nombre: string; inicio: string; fin: string }>;
    semana_santa: boolean;
    festivos: boolean;
    recuperacion_periodo: { dias_antes_del_fin: number; dias_limite_despues_del_fin: number };
    recuperacion_final: { inicio: string; fin: string; limite_resultados: string };
  };
  escala: {
    minima: number;
    maxima: number;
    aprobatoria: number;
    decimales: number;
    rangos: Array<{ nivel: string; etiqueta: string; minimo: number; maximo: number; aprobatorio: boolean }>;
  };
  molde_planilla: Array<{ clave: string; nombre: string; porcentaje: number; max_casillas: number }>;
  promocion: { recuperacion_hasta: number; efecto_nota_recuperacion: string; servicio_social_horas: number; texto_siee: string };
  recuperacion_periodo: { aplica: boolean; momento: string; efecto: string; max_intentos: number };
  poblacion: {
    categorias: string[];
    por_grado: Record<string, number[]>;
    nota_por_categoria: Record<string, [number, number]>;
    /** Por grado: [edad ideal, % con la edad ideal, % con un año más, % de repitentes]; el resto tiene dos años o más. */
    edad: Record<string, [number, number, number, number]>;
    familias_con_hermanos: number;
    documentos_pendientes: number;
    correlacion_latentes: number;
  };
  asistencia: ParametrosAsistencia;
  convivencia: ParametrosConvivencia & { faltas: Array<{ codigo: string; gravedad: Gravedad; descripcion: string }> };
}

const hora = Joi.string().pattern(/^\d{2}:\d{2}$/);
const mesDia = Joi.string().pattern(/^\d{2}-\d{2}$/);
const dane = Joi.string().pattern(/^\d{12}$/);
const celdas = Joi.array().items(Joi.object({ dias: Joi.array().items(Joi.number().integer().min(1).max(7)).min(1).required(), periodos: Joi.array().items(Joi.number().integer().min(0)).min(1).required() }));

const esquema = Joi.object({
  version: Joi.number().valid(1).required(),
  semilla: Joi.number().integer().min(0).required(),
  anios: Joi.array().items(Joi.number().integer().min(2000).max(2100)).min(1).required(),
  dominio_correo: Joi.string().required(),
  inicio_simulacion: Joi.string().isoDate().required(),
  fecha_corte: Joi.string().isoDate(),
  admin: Joi.object({ nombre: Joi.string().required(), apellido: Joi.string().required(), numero_documento: Joi.string().required(), email: Joi.string().email().required() }).required(),
  institucion: Joi.object({
    nombre: Joi.string().required(),
    dane: dane.required(),
    nit: Joi.string().required(),
    resolucion: Joi.string().required(),
    ciudad: Joi.string().required(),
    departamento: Joi.string().required(),
    modalidad: Joi.string().valid('PRESENCIAL', 'VIRTUAL').required(),
    politica_aforo_aula: Joi.string().valid('BLOQUEAR', 'ADVERTIR').required(),
    titulo_bachiller: Joi.string().required(),
  }).required(),
  sedes: Joi.array()
    .items(
      Joi.object({
        clave: Joi.string().required(),
        nombre: Joi.string().required(),
        dane: dane.required(),
        direccion: Joi.string().required(),
        telefono: Joi.string().required(),
        es_principal: Joi.boolean().required(),
        jornadas: Joi.array()
          .items(
            Joi.object({
              nombre: Joi.string().valid('MANANA', 'UNICA', 'TARDE').required(),
              inicio: hora.required(),
              fin: hora.required(),
              dias: Joi.array().items(Joi.number().integer().min(1).max(7)).min(1).required(),
              franjas: Joi.array().items(Joi.object({ nombre: Joi.string().required(), tipo: Joi.string().valid('CLASE', 'DESCANSO').required(), inicio: hora.required(), fin: hora.required() })).min(1).required(),
            })
          )
          .min(1)
          .required(),
      })
    )
    .min(1)
    .required(),
  plantilla_franjas: Joi.array().items(Joi.object({ nombre: Joi.string().required(), tipo: Joi.string().valid('CLASE', 'DESCANSO').required(), duracion_min: Joi.number().integer().min(5).required() })).required(),
  grados_activos: Joi.array().items(Joi.number().integer().min(-2).max(11)).min(1).required(),
  areas: Joi.array()
    .items(
      Joi.object({
        codigo: Joi.string().required(),
        nombre: Joi.string().required(),
        asignaturas: Joi.array()
          .items(
            Joi.object({
              clave: Joi.string().required(),
              nombre: Joi.string().required(),
              abreviatura: Joi.string().required(),
              niveles: Joi.array().items(Joi.string().valid(...NIVELES_EDUCATIVOS)).min(1).required(),
              tipo_nota: Joi.string().valid('CRITICA', 'MODERADA', 'BLANDA').required(),
            })
          )
          .min(1)
          .required(),
      })
    )
    .min(1)
    .required(),
  plan_estudios: Joi.array()
    .items(
      Joi.object({
        grados: Joi.array().items(Joi.number().integer()).min(1).required(),
        asignaturas: Joi.object().pattern(Joi.string(), Joi.number().integer().min(1)).required(),
        ponderaciones: Joi.array().items(Joi.object({ area: Joi.string().required(), asignaturas: Joi.object().pattern(Joi.string(), Joi.number().min(1).max(100)).required() })),
      })
    )
    .required(),
  limites_horas_plan: Joi.object().pattern(Joi.string().valid(...NIVELES_EDUCATIVOS), Joi.number().integer().min(1).max(50)).required(),
  grupos: Joi.array()
    .items(
      Joi.object({
        grado: Joi.number().integer().required(),
        sede: Joi.string().required(),
        jornada: Joi.string().valid('MANANA', 'UNICA', 'TARDE').required(),
        nomenclaturas: Joi.array().items(Joi.string()).min(1).required(),
        cupo: Joi.number().integer().min(1).required(),
        estudiantes: Joi.array().items(Joi.number().integer().min(1)).length(2).required(),
      })
    )
    .required(),
  espacios_extra: Joi.array().items(Joi.object({ sede: Joi.string().required(), nombre: Joi.string().required(), tipo: Joi.string().valid(...TIPOS_ESPACIO).required(), capacidad: Joi.number().integer().min(1).required() })).required(),
  personal: Joi.array().items(Joi.object({ clave: Joi.string().required(), rol: Joi.string().required(), sedes: Joi.array().items(Joi.string()).required(), genero: Joi.string().valid('M', 'F').required() })).required(),
  docentes: Joi.object({
    horas_min: Joi.number().integer().min(1).required(),
    horas_max: Joi.number().integer().min(1).required(),
    tolerancia_subcarga_horas: Joi.number().integer().min(0).max(10).required(),
    plazas: Joi.array()
      .items(
        Joi.object({
          clave: Joi.string().required(),
          sede: Joi.string().required(),
          titular: Joi.boolean(),
          puede: Joi.array().items(Joi.object({ asignaturas: Joi.array().items(Joi.string()).min(1).required(), grados: Joi.array().items(Joi.number().integer()) })).min(1).required(),
        })
      )
      .required(),
  }).required(),
  horarios: Joi.object({
    orden: Joi.array().items(Joi.string()).required(),
    intentos: Joi.number().integer().min(1).max(10).required(),
    tiempo_max_ms: Joi.number().integer().min(1000).max(60000).required(),
    variables: Joi.array()
      .items(
        Joi.object({
          jornada: Joi.string().required(),
          descripcion: Joi.string().required(),
          tipo: Joi.string().valid('DISPONIBILIDAD', 'DISTRIBUCION_BLOQUES').required(),
          grados: Joi.array().items(Joi.number().integer()),
          asignaturas: Joi.array().items(Joi.string()),
          docentes: Joi.array().items(Joi.string()),
          bloques: Joi.array().items(Joi.number().integer().min(1)),
          no_disponible: celdas,
          solo_disponible: celdas,
        })
      )
      .required(),
  }).required(),
  calendario: Joi.object({
    calendario: Joi.string().valid('A', 'B').required(),
    inicio_anio: mesDia.required(),
    fin_anio: mesDia.required(),
    periodos: Joi.array().items(Joi.object({ numero: Joi.number().integer().min(1).max(4).required(), nombre: Joi.string().required(), porcentaje: Joi.number().required(), inicio: mesDia.required(), fin: mesDia.required() })).min(2).max(4).required(),
    no_lectivos: Joi.array().items(Joi.object({ tipo: Joi.string().valid('RECESO', 'VACACIONES', 'DESARROLLO_INSTITUCIONAL').required(), nombre: Joi.string().required(), inicio: mesDia.required(), fin: mesDia.required() })).required(),
    semana_santa: Joi.boolean().required(),
    festivos: Joi.boolean().required(),
    recuperacion_periodo: Joi.object({ dias_antes_del_fin: Joi.number().integer().min(0).required(), dias_limite_despues_del_fin: Joi.number().integer().min(0).required() }).required(),
    recuperacion_final: Joi.object({ inicio: mesDia.required(), fin: mesDia.required(), limite_resultados: mesDia.required() }).required(),
  }).required(),
  escala: Joi.object({
    minima: Joi.number().required(),
    maxima: Joi.number().required(),
    aprobatoria: Joi.number().required(),
    decimales: Joi.number().integer().min(0).max(4).required(),
    rangos: Joi.array().items(Joi.object({ nivel: Joi.string().valid(...NIVELES_DESEMPENO).required(), etiqueta: Joi.string().required(), minimo: Joi.number().required(), maximo: Joi.number().required(), aprobatorio: Joi.boolean().required() })).length(4).required(),
  }).required(),
  molde_planilla: Joi.array().items(Joi.object({ clave: Joi.string().pattern(/^[A-Z0-9_]{2,40}$/).required(), nombre: Joi.string().required(), porcentaje: Joi.number().required(), max_casillas: Joi.number().integer().min(1).required() })).min(1).required(),
  promocion: Joi.object({ recuperacion_hasta: Joi.number().integer().min(0).required(), efecto_nota_recuperacion: Joi.string().required(), servicio_social_horas: Joi.number().integer().min(1).required(), texto_siee: Joi.string().allow('').required() }).required(),
  recuperacion_periodo: Joi.object({ aplica: Joi.boolean().required(), momento: Joi.string().required(), efecto: Joi.string().required(), max_intentos: Joi.number().integer().min(1).required() }).required(),
  poblacion: Joi.object({
    categorias: Joi.array().items(Joi.string()).length(4).required(),
    por_grado: Joi.object().pattern(Joi.string(), Joi.array().items(Joi.number().min(0).max(1)).length(4)).required(),
    nota_por_categoria: Joi.object().pattern(Joi.string(), Joi.array().items(Joi.number()).length(2)).required(),
    edad: Joi.object().pattern(Joi.string(), Joi.array().items(Joi.number()).length(4)).required(),
    familias_con_hermanos: Joi.number().min(0).max(1).required(),
    documentos_pendientes: Joi.number().min(0).max(1).required(),
    correlacion_latentes: Joi.number().min(-1).max(1).required(),
  }).required(),
  asistencia: Joi.object({
    proporcion_justificadas: Joi.number().min(0).max(1).required(),
    factor_retardo: Joi.number().min(0).required(),
    dias_por_registro: Joi.number().integer().min(1).max(31).required(),
  }).required(),
  convivencia: Joi.object({
    tasa: Joi.object({ I: Joi.number().min(0).required(), II: Joi.number().min(0).required(), III: Joi.number().min(0).required() }).required(),
    factor_secundaria: Joi.number().min(0).required(),
    factor_primaria_baja: Joi.number().min(0).required(),
    faltas: Joi.array()
      .items(Joi.object({ codigo: Joi.string().max(20).required(), gravedad: Joi.string().valid('I', 'II', 'III').required(), descripcion: Joi.string().max(400).required() }))
      .min(1)
      .required(),
  }).required(),
});

/** Reglas que cruzan secciones: que todo lo que se nombra exista y que cada grupo llene exactamente las franjas de su jornada. */
function revisarCoherencia(c: ConfigSimulacion): string[] {
  const problemas: string[] = [];
  const asignaturas = new Set(c.areas.flatMap((a) => a.asignaturas.map((s) => s.clave)));
  const sedes = new Map(c.sedes.map((s) => [s.clave, s]));
  const plazas = new Set(c.docentes.plazas.map((p) => p.clave));

  for (const plan of c.plan_estudios) {
    for (const clave of Object.keys(plan.asignaturas)) if (!asignaturas.has(clave)) problemas.push(`El plan de ${plan.grados.join(',')} nombra la asignatura «${clave}», que no existe.`);
  }
  for (const g of c.grupos) {
    const sede = sedes.get(g.sede);
    if (!sede) {
      problemas.push(`El grado ${g.grado} usa la sede «${g.sede}», que no existe.`);
      continue;
    }
    const jornada = sede.jornadas.find((j) => j.nombre === g.jornada);
    if (!jornada) {
      problemas.push(`La sede «${g.sede}» no tiene jornada ${g.jornada} (grado ${g.grado}).`);
      continue;
    }
    const plan = c.plan_estudios.find((p) => p.grados.includes(g.grado));
    if (!plan) {
      problemas.push(`El grado ${g.grado} no tiene plan de estudios.`);
      continue;
    }
    const horas = Object.values(plan.asignaturas).reduce((s, h) => s + h, 0);
    const franjas = jornada.franjas.filter((f) => f.tipo === 'CLASE').length * jornada.dias.length;
    if (horas > franjas) problemas.push(`El grado ${g.grado} tiene ${horas} h y su jornada solo ${franjas} franjas.`);
    if (g.estudiantes[1] > g.cupo) problemas.push(`El grado ${g.grado} quiere hasta ${g.estudiantes[1]} estudiantes con cupo ${g.cupo}.`);
    if (!c.poblacion.por_grado[String(g.grado)] || !c.poblacion.edad[String(g.grado)]) problemas.push(`El grado ${g.grado} no tiene matriz de perfiles o de edades.`);
  }
  for (const p of c.docentes.plazas) {
    if (!sedes.has(p.sede)) problemas.push(`La plaza ${p.clave} usa la sede «${p.sede}», que no existe.`);
    for (const regla of p.puede) for (const a of regla.asignaturas) if (!asignaturas.has(a)) problemas.push(`La plaza ${p.clave} dicta «${a}», que no existe.`);
  }
  for (const v of c.horarios.variables) {
    if (!c.horarios.orden.includes(v.jornada)) problemas.push(`La variable «${v.descripcion}» es de la jornada «${v.jornada}», que no está en el orden de horarios.`);
    for (const d of v.docentes ?? []) if (!plazas.has(d)) problemas.push(`La variable «${v.descripcion}» nombra al docente «${d}», que no existe.`);
    for (const a of v.asignaturas ?? []) if (!asignaturas.has(a)) problemas.push(`La variable «${v.descripcion}» nombra la asignatura «${a}», que no existe.`);
  }
  const sumaPeriodos = c.calendario.periodos.reduce((s, p) => s + p.porcentaje, 0);
  if (Math.abs(sumaPeriodos - 100) > 0.01) problemas.push(`Los periodos suman ${sumaPeriodos}%, no 100%.`);
  const sumaMolde = c.molde_planilla.reduce((s, b) => s + b.porcentaje, 0);
  if (Math.abs(sumaMolde - 100) > 0.01) problemas.push(`El molde de la planilla suma ${sumaMolde}%, no 100%.`);
  return problemas;
}

export function cargarConfiguracion(ruta: string): ConfigSimulacion {
  const absoluta = path.resolve(ruta);
  const crudo = JSON.parse(fs.readFileSync(absoluta, 'utf-8')) as unknown;
  const { value, error } = esquema.validate(crudo, { abortEarly: false });
  if (error) throw new Error(`Configuración inválida (${absoluta}):\n- ${error.details.map((d) => d.message).join('\n- ')}`);
  const config = value as ConfigSimulacion;
  const problemas = revisarCoherencia(config);
  if (problemas.length > 0) throw new Error(`Configuración incoherente (${absoluta}):\n- ${problemas.join('\n- ')}`);
  return config;
}

/** Utilidades de lectura que usan varias fases. */
export function asignaturaDe(config: ConfigSimulacion, clave: string): AsignaturaConfig & { area: string } {
  for (const area of config.areas) {
    const a = area.asignaturas.find((s) => s.clave === clave);
    if (a) return { ...a, area: area.codigo };
  }
  throw new Error(`La asignatura «${clave}» no está en la configuración.`);
}

export function planDeGrado(config: ConfigSimulacion, grado: number): PlanConfig {
  const plan = config.plan_estudios.find((p) => p.grados.includes(grado));
  if (!plan) throw new Error(`El grado ${grado} no tiene plan de estudios en la configuración.`);
  return plan;
}

/** «principal:MANANA». */
export function claveJornada(sede: string, jornada: string): string {
  return `${sede}:${jornada}`;
}
