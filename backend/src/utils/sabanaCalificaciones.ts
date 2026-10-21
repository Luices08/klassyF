import { contarReprobadas } from './recuperaciones';

export interface AsignaturaSabana {
  subject_id: string;
  nombre: string;
  abreviatura: string;
}

export interface NotaSabana {
  nota: number | null;
  /** Exenta por traslado: no es un cero, no cuenta ni como aprobada ni como perdida. */
  exenta: boolean;
  /** La nota ya incluye una recuperación. */
  recuperada: boolean;
}

export interface EstudianteSabanaEntrada {
  student_id: string;
  numero_documento: string;
  nombres: string;
  apellidos: string;
  notas: Record<string, NotaSabana>;
  /** Promedio general según el boletín (por áreas) o, si no se pudo, el simple de asignaturas; null si falta alguna nota. */
  promedio: number | null;
  fallas: number;
  promocion: { codigo: string; texto: string; oficial: boolean } | null;
}

export interface FilaSabana extends EstudianteSabanaEntrada {
  puesto: number | null;
  reprobadas: number;
  /** Cuántas asignaturas del plan aún no tienen nota (sin contar exentas). */
  sin_nota: number;
}

export interface ResumenAsignatura {
  subject_id: string;
  promedio: number | null;
  aprobaron: number;
  reprobaron: number;
  sin_nota: number;
}

export interface Sabana {
  asignaturas: AsignaturaSabana[];
  filas: FilaSabana[];
  resumen: ResumenAsignatura[];
}

const redondear = (n: number, decimales: number): number => {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
};

const comparar = (a: string, b: string): number => a.localeCompare(b, 'es', { sensitivity: 'base' });

/**
 * Puesto de cada estudiante por promedio, como en el boletín: los empatados comparten puesto y el siguiente salta. Solo entran quienes
 * tienen promedio y todas sus notas (nunca se promedia lo que falta); los demás no reciben puesto.
 */
export function calcularPuestos(candidatos: Array<{ id: string; promedio: number | null; completo: boolean }>): Map<string, number> {
  const puestos = new Map<string, number>();
  const ordenados = candidatos.filter((c) => c.promedio !== null && c.completo).sort((a, b) => (b.promedio as number) - (a.promedio as number));
  let puesto = 0;
  let anterior: number | null = null;
  ordenados.forEach((c, i) => {
    if (anterior === null || c.promedio !== anterior) {
      puesto = i + 1;
      anterior = c.promedio;
    }
    puestos.set(c.id, puesto);
  });
  return puestos;
}

/**
 * Arma la matriz de un grupo. No lee nada ni escribe nada: recibe las notas ya resueltas.
 * Estudiantes en orden alfabético (apellidos, nombres). El puesto solo se da a quien tiene todas sus notas (nunca se
 * promedia lo que falta) y, como en el boletín, los empatados comparten puesto y el siguiente salta.
 */
export function armarSabana(params: {
  asignaturas: AsignaturaSabana[];
  estudiantes: EstudianteSabanaEntrada[];
  notaAprobatoria: number;
  decimales: number;
  mostrarPuesto: boolean;
}): Sabana {
  const { asignaturas, notaAprobatoria, decimales } = params;
  const ordenados = [...params.estudiantes].sort((a, b) => comparar(a.apellidos, b.apellidos) || comparar(a.nombres, b.nombres));

  const filas: FilaSabana[] = ordenados.map((e) => {
    const celdas = asignaturas.map((a) => e.notas[a.subject_id] ?? { nota: null, exenta: false, recuperada: false });
    return {
      ...e,
      puesto: null,
      reprobadas: contarReprobadas(celdas.map((c) => ({ nota: c.nota, exenta: c.exenta })), notaAprobatoria),
      sin_nota: celdas.filter((c) => !c.exenta && c.nota === null).length,
    };
  });

  if (params.mostrarPuesto) {
    const puestos = calcularPuestos(filas.map((f) => ({ id: f.student_id, promedio: f.promedio, completo: f.sin_nota === 0 })));
    for (const f of filas) f.puesto = puestos.get(f.student_id) ?? null;
  }

  const resumen: ResumenAsignatura[] = asignaturas.map((a) => {
    const celdas = filas.map((f) => f.notas[a.subject_id] ?? { nota: null, exenta: false, recuperada: false }).filter((c) => !c.exenta);
    const conNota = celdas.filter((c) => c.nota !== null).map((c) => c.nota as number);
    return {
      subject_id: a.subject_id,
      promedio: conNota.length > 0 ? redondear(conNota.reduce((s, n) => s + n, 0) / conNota.length, decimales) : null,
      aprobaron: conNota.filter((n) => n >= notaAprobatoria).length,
      reprobaron: conNota.filter((n) => n < notaAprobatoria).length,
      sin_nota: celdas.length - conNota.length,
    };
  });

  return { asignaturas, filas, resumen };
}

/** Texto corto de la decisión de promoción para la columna final de la sábana. */
export const ETIQUETA_PROMOCION_SABANA: Record<string, string> = {
  PROMOVIDO: 'Promovido',
  PROMOVIDO_POR_RECUPERACION: 'Promovido (recuperación)',
  PROMOVIDO_CON_ARRASTRE: 'Promovido con pendientes',
  NO_PROMOVIDO: 'No promovido',
  PENDIENTE_RECUPERACION: 'Pendiente de recuperación',
  EN_COMISION: 'En comisión',
  RETIRO_PROPUESTO: 'Retiro por confirmar',
  INCOMPLETO: 'Notas incompletas',
};

/** «10-A»; para los grados sin número positivo (Transición, Jardín…) se usa el nombre del grado. */
export const etiquetaDeGrupo = (gradoNumero: number, gradoNombre: string, nomenclatura: string): string =>
  gradoNumero > 0 ? `${gradoNumero}-${nomenclatura}` : `${gradoNombre} ${nomenclatura}`;
