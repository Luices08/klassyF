import { ModoIntegracion } from '../constants/recuperaciones';
import { BloqueCalculo, calcularNotaAsignatura, CasillaCalculo } from './calculoNotas';

/**
 * Integración de la nota de una recuperación de periodo a la nota de la asignatura (M18 → M12). Función pura: recibe las notas
 * de las casillas de M12 y devuelve cómo queda la asignatura según lo que el colegio configuró. No escribe nada en M12: la nota
 * cerrada del docente queda intacta y el resultado vive en la `Recuperacion`.
 */

export interface IntegracionPeriodo {
  modo: ModoIntegracion;
  /** Bloque del molde al que apunta el modo (obligatorio en REEMPLAZA_BLOQUE y CASILLA_ADICIONAL; en REEMPLAZA_NOTA_MAS_BAJA, '' = cualquier casilla). */
  bloque_clave: string;
  /** Solo CASILLA_ADICIONAL: % del bloque que pesa la recuperación; null = una parte igual a las demás casillas. */
  peso: number | null;
  /** Si es cierto, recuperar nunca baja la nota de la asignatura. */
  solo_si_mejora: boolean;
  /** Si es cierto, la nota resultante no pasa de la nota aprobatoria. */
  tope_aprobatoria: boolean;
  /** Si es falso, la recuperación se anota pero la nota del boletín y la definitiva del año siguen siendo las originales. */
  cuenta_en_boletin: boolean;
}

export const INTEGRACION_INICIAL: IntegracionPeriodo = {
  modo: 'NOTA_FINAL',
  bloque_clave: '',
  peso: null,
  solo_si_mejora: true,
  tope_aprobatoria: false,
  cuenta_en_boletin: true,
};

/** Completa lo que falte (una política guardada antes de que existiera la integración no la trae). */
export function integracionDe(parcial: Partial<IntegracionPeriodo> | null | undefined): IntegracionPeriodo {
  // Campo por campo (no `...parcial`): llega a veces como subdocumento de Mongoose y un spread copiaría sus internos.
  const modo = parcial?.modo ?? INTEGRACION_INICIAL.modo;
  return {
    modo,
    bloque_clave: parcial?.bloque_clave ?? INTEGRACION_INICIAL.bloque_clave,
    peso: modo === 'CASILLA_ADICIONAL' ? (parcial?.peso ?? INTEGRACION_INICIAL.peso) : null,
    solo_si_mejora: parcial?.solo_si_mejora ?? INTEGRACION_INICIAL.solo_si_mejora,
    tope_aprobatoria: parcial?.tope_aprobatoria ?? INTEGRACION_INICIAL.tope_aprobatoria,
    cuenta_en_boletin: parcial?.cuenta_en_boletin ?? INTEGRACION_INICIAL.cuenta_en_boletin,
  };
}

/** Problemas de una integración frente a los bloques del molde del año; null si es coherente. */
export function validarIntegracion(integracion: IntegracionPeriodo, clavesBloques?: readonly string[]): string | null {
  const { modo, bloque_clave: bloque, peso } = integracion;
  if ((modo === 'REEMPLAZA_BLOQUE' || modo === 'CASILLA_ADICIONAL') && !bloque) {
    return 'Elige el bloque de la nota donde entra la recuperación.';
  }
  if (bloque && clavesBloques && !clavesBloques.includes(bloque)) {
    return `El bloque «${bloque}» no existe en el molde de notas de este año lectivo.`;
  }
  if (modo === 'CASILLA_ADICIONAL' && peso !== null && (!(peso > 0) || peso > 100)) {
    return 'El peso de la recuperación debe estar entre 0 y 100 (% del bloque).';
  }
  return null;
}

export interface EntradaIntegracion {
  integracion: IntegracionPeriodo;
  bloques: ReadonlyArray<BloqueCalculo & { nombre: string }>;
  casillas: ReadonlyArray<CasillaCalculo & { titulo: string }>;
  /** Notas del estudiante: id de casilla -> nota. */
  notas: ReadonlyMap<string, number>;
  notaRecuperacion: number;
  notaAprobatoria: number;
  decimales: number;
}

export interface ResultadoIntegracion {
  /** Falso cuando la configuración no cambió nada (p. ej. la recuperación no mejora y el colegio exige que mejore). */
  aplicada: boolean;
  nota: number;
  bloques: Array<{ clave: string; nombre: string; porcentaje: number; nota: number }>;
  /** Frase para mostrar al docente y guardar con la recuperación. */
  detalle: string;
}

const redondear = (valor: number, decimales: number): number => {
  const factor = 10 ** decimales;
  return Math.round((valor + Number.EPSILON) * factor) / factor;
};

const ID_CASILLA_RECUPERACION = '__recuperacion__';

/** Solo los modos que recalculan sobre las casillas; NOTA_FINAL lo resuelve `notaTrasRecuperar`. */
export function integrarRecuperacion(entrada: EntradaIntegracion): ResultadoIntegracion {
  const { integracion, bloques, casillas, notas, notaRecuperacion, notaAprobatoria, decimales } = entrada;
  const nombreDe = new Map(bloques.map((b) => [b.clave, b.nombre]));
  const porcentajeDe = new Map(bloques.map((b) => [b.clave, b.porcentaje]));

  const base = calcularNotaAsignatura({ bloques, casillas, notas });
  const notaBase = base.nota as number;
  const aBloques = (resultado: typeof base): ResultadoIntegracion['bloques'] =>
    resultado.bloques.map((b) => ({
      clave: b.clave,
      nombre: nombreDe.get(b.clave) ?? b.clave,
      porcentaje: porcentajeDe.get(b.clave) ?? 0,
      nota: b.nota ?? 0,
    }));
  const sinCambio = (detalle: string): ResultadoIntegracion => ({ aplicada: false, nota: redondear(notaBase, decimales), bloques: aBloques(base), detalle });

  let casillasFinales: ReadonlyArray<CasillaCalculo & { titulo?: string }> = casillas;
  const notasFinales = new Map(notas);
  let descripcion: string;

  switch (integracion.modo) {
    case 'REEMPLAZA_NOTA_MAS_BAJA': {
      const candidatas = casillas.filter((c) => notas.has(c.id) && (!integracion.bloque_clave || c.bloque === integracion.bloque_clave));
      const masBaja = candidatas.reduce<(typeof candidatas)[number] | null>(
        (menor, c) => (menor === null || (notas.get(c.id) as number) < (notas.get(menor.id) as number) ? c : menor),
        null
      );
      if (!masBaja) return sinCambio('No hay notas sobre las que aplicar la recuperación.');
      descripcion = `La recuperación (${notaRecuperacion}) ocupó el lugar de «${masBaja.titulo}» (${notas.get(masBaja.id)}).`;
      notasFinales.set(masBaja.id, notaRecuperacion);
      break;
    }
    case 'REEMPLAZA_BLOQUE': {
      const delBloque = casillas.filter((c) => c.bloque === integracion.bloque_clave && notas.has(c.id));
      if (delBloque.length === 0) return sinCambio('El bloque elegido no tiene notas sobre las que aplicar la recuperación.');
      for (const c of delBloque) notasFinales.set(c.id, notaRecuperacion);
      descripcion = `La recuperación (${notaRecuperacion}) pasó a ser la nota del bloque «${nombreDe.get(integracion.bloque_clave) ?? integracion.bloque_clave}».`;
      break;
    }
    case 'CASILLA_ADICIONAL': {
      casillasFinales = [...casillas, { id: ID_CASILLA_RECUPERACION, bloque: integracion.bloque_clave, peso: integracion.peso, titulo: 'Recuperación' }];
      notasFinales.set(ID_CASILLA_RECUPERACION, notaRecuperacion);
      descripcion = `La recuperación (${notaRecuperacion}) se sumó como una nota más del bloque «${nombreDe.get(integracion.bloque_clave) ?? integracion.bloque_clave}».`;
      break;
    }
    default:
      throw new Error(`El modo ${integracion.modo} no se calcula sobre las casillas.`);
  }

  const calculada = calcularNotaAsignatura({ bloques, casillas: casillasFinales, notas: notasFinales });
  let nota = calculada.nota as number;
  let detalle = descripcion;

  if (integracion.solo_si_mejora && nota < notaBase) {
    return sinCambio('La recuperación no mejora la nota y el colegio exige que mejore: la nota se conserva.');
  }
  if (integracion.tope_aprobatoria && nota > notaAprobatoria) {
    nota = Math.max(notaAprobatoria, notaBase);
    detalle += ` La nota se limitó a la aprobatoria (${notaAprobatoria}).`;
  }
  return { aplicada: true, nota: redondear(nota, decimales), bloques: aBloques(calculada), detalle };
}
