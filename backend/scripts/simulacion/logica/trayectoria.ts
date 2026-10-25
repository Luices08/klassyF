/**
 * Cómo cambia un estudiante de un año al siguiente y qué le pasa durante el año (salir del colegio, prestar el servicio social,
 * presentar Saber 11). Funciones puras con pruebas: todo sale de las variables latentes del perfil oculto y del azar con semilla.
 */
import { Azar } from '../nucleo/azar';
import { FAMILIAS_AREA, FamiliaArea, Latentes } from './perfiles';

const acotar = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

/** La categoría de desempeño que corresponde a una habilidad (los cortes quedan a mitad de camino entre las medias de la matriz). */
export function categoriaDeHabilidad(habilidad: number): 'BAJO' | 'BASICO' | 'ALTO' | 'SUPERIOR' {
  if (habilidad < 2.85) return 'BAJO';
  if (habilidad < 3.8) return 'BASICO';
  if (habilidad < 4.5) return 'ALTO';
  return 'SUPERIOR';
}

/**
 * Las latentes del año siguiente: la habilidad se mueve con la tendencia que traía (quien venía mejorando sigue mejorando) y algo de
 * ruido, quien repite el grado mejora un poco, y las demás se mueven poco (la constancia de un estudiante no cambia de golpe).
 */
export function evolucionarLatentes(latentes: Latentes, repite: boolean, azar: Azar): Latentes {
  const delta = latentes.tendencia * 3 + azar.normal(0, 0.12) + (repite ? 0.15 : 0);
  const habilidad = acotar(latentes.habilidad + delta, 1.2, 5);
  const habilidad_area = Object.fromEntries(
    FAMILIAS_AREA.map((familia) => [familia, acotar((latentes.habilidad_area[familia] ?? latentes.habilidad) + delta + azar.normal(0, 0.08), 1, 5)])
  ) as Record<FamiliaArea, number>;
  return {
    habilidad,
    habilidad_area,
    constancia: acotar(latentes.constancia + azar.normal(0, 0.04) + 0.02 * delta, 0.15, 0.99),
    asistencia_base: acotar(latentes.asistencia_base + azar.normal(0, 0.008), 0.005, 0.3),
    puntualidad: acotar(latentes.puntualidad + azar.normal(0, 0.005), 0.002, 0.25),
    tendencia: acotar(0.5 * latentes.tendencia + azar.normal(0, 0.04), -0.15, 0.15),
    volatilidad: acotar(latentes.volatilidad + azar.normal(0, 0.02), 0.1, 0.4),
    riesgo_convivencia: acotar(latentes.riesgo_convivencia + azar.normal(0, 0.05), 0, 1),
    riesgo_desercion: acotar(latentes.riesgo_desercion + azar.normal(0, 0.03) + (repite ? 0.05 : 0), 0, 1),
  };
}

export type TipoSalida = 'RETIRO' | 'TRASLADO';

export interface Salida {
  tipo: TipoSalida;
  motivo: string;
}

const MOTIVOS_RETIRO = [
  'Cambio de domicilio de la familia fuera del municipio.',
  'Dificultades económicas de la familia.',
  'El estudiante empezó a trabajar y dejó de asistir.',
  'Desescolarización por inasistencia prolongada sin justificación.',
  'La familia decidió retirarlo por motivos personales.',
];

/**
 * ¿Sale del colegio a comienzos de este periodo? Solo lo piensa quien tiene riesgo de deserción por encima de lo normal; casi la mitad
 * de las salidas son traslados a otro colegio y el resto retiros. En promedio sale un 5 a 7 % de la matrícula en el año.
 */
export function decidirSalida(latentes: Latentes, azar: Azar): Salida | null {
  const probabilidad = acotar(latentes.riesgo_desercion - 0.18, 0, 1) * 0.35 + (latentes.constancia < 0.55 ? 0.01 : 0);
  if (!azar.prob(probabilidad)) return null;
  return azar.prob(0.45) ? { tipo: 'TRASLADO', motivo: 'Traslado a otra institución educativa por cambio de domicilio.' } : { tipo: 'RETIRO', motivo: azar.elegir(MOTIVOS_RETIRO) };
}

export interface TandaServicioSocial {
  horas: number;
  entidad: string;
  descripcion: string;
}

const ENTIDADES_SERVICIO_SOCIAL = [
  ['Hogar infantil El Poblado', 'Acompañamiento a los niños en actividades lúdicas y de refuerzo.'],
  ['Biblioteca municipal', 'Apoyo en la organización del material y en las jornadas de lectura.'],
  ['Junta de Acción Comunal', 'Campañas de aseo y cuidado del barrio.'],
  ['Hogar geriátrico San José', 'Compañía y actividades recreativas con los adultos mayores.'],
  ['Secretaría de Cultura y Deporte', 'Apoyo en los torneos deportivos de las vacaciones recreativas.'],
] as const;

/** Las horas que le faltan para las exigidas y la tanda que presta en el periodo (hasta 40 h cada vez; si no es constante, a veces no cumple). */
export function planearServicioSocial(horasVerificadas: number, horasExigidas: number, constancia: number, azar: Azar): TandaServicioSocial | null {
  const faltan = horasExigidas - horasVerificadas;
  if (faltan <= 0) return null;
  if (!azar.prob(acotar(0.55 + constancia * 0.5, 0.3, 0.97))) return null;
  const [entidad, descripcion] = azar.elegir(ENTIDADES_SERVICIO_SOCIAL as unknown as Array<readonly [string, string]>) as readonly [string, string];
  return { horas: Math.min(faltan, 40), entidad, descripcion };
}

/** Número de registro de Saber 11: «AC» + año + 8 dígitos (la forma que valida el sistema). */
export function registroSaber11(anio: number, azar: Azar): string {
  return `AC${anio}${String(azar.entero(0, 99_999_999)).padStart(8, '0')}`;
}

/** ¿Confirma el paz y salvo de fin de año? Casi todos; unos pocos quedan con algo pendiente (libro, cartera) y lo resuelven después. */
export function confirmaPazYSalvo(azar: Azar): boolean {
  return !azar.prob(0.04);
}
