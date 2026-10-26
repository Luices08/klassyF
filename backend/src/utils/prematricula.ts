import { finDelDia, inicioDelDia } from './calendarioAcademico';

// Funciones puras de la prematrícula (M04): cuándo está abierta la ventana, si una reserva sigue vigente y cuántos cupos quedan por grado, sede y jornada.
// Sin base de datos y con tests; el servicio solo reúne los datos.

/** La ventana está abierta del primer al último día (el cierre es inclusivo), en hora de Colombia. */
export function ventanaAbierta(ventana: { desde: Date; hasta: Date }, ahora: Date = new Date()): boolean {
  return ahora.getTime() >= inicioDelDia(ventana.desde).getTime() && ahora.getTime() <= finDelDia(ventana.hasta).getTime();
}

/** Una reserva ocupa cupo hasta el último día para matricular (inclusive); sin límite configurado no vence. */
export function reservaVigente(fechaLimiteMatricula: Date | null, ahora: Date = new Date()): boolean {
  return fechaLimiteMatricula === null || ahora.getTime() <= finDelDia(fechaLimiteMatricula).getTime();
}

export interface CubetaDeCupos {
  grade_id: string;
  sede_id: string;
  jornada_id: string;
}

export const claveDeCubeta = (c: CubetaDeCupos): string => `${c.grade_id}|${c.sede_id}|${c.jornada_id}`;

export interface GrupoParaCupos extends CubetaDeCupos {
  max_capacity: number;
  cupos_ocupados: number;
}

export interface FilaDeCupos extends CubetaDeCupos {
  /** Suma de la capacidad de los grupos activos de ese grado, sede y jornada. */
  capacidad: number;
  /** Lo que ya tienen las matrículas (preinscritas y formalizadas): `cupos_ocupados` de cada grupo. */
  ocupados: number;
  /** Solicitudes con el cupo reservado y vigente (aún sin grupo). */
  reservados: number;
  /** Estudiantes antiguos que confirmaron que continúan y aún no tienen pre-matrícula: su cupo está apartado. */
  continuan: number;
  /** Solicitudes esperando a que se libere un cupo, en orden de inscripción. */
  en_espera: number;
  /** capacidad − ocupados − reservados − continuan. Puede ser negativo: se aprobaron más de los que cabían. */
  libres: number;
}

/**
 * Los cupos por grado, sede y jornada. Un grupo cerrado no entra (el llamador solo pasa los activos). Las reservas y las esperas de una cubeta sin grupos
 * se ignoran: sin grupos no hay dónde reservar, y la pantalla ya avisa que faltan.
 */
export function calcularCupos(
  grupos: readonly GrupoParaCupos[],
  reservas: readonly CubetaDeCupos[],
  enEspera: readonly CubetaDeCupos[],
  continuan: readonly CubetaDeCupos[] = []
): FilaDeCupos[] {
  const filas = new Map<string, FilaDeCupos>();
  for (const g of grupos) {
    const clave = claveDeCubeta(g);
    const fila = filas.get(clave) ?? { grade_id: g.grade_id, sede_id: g.sede_id, jornada_id: g.jornada_id, capacidad: 0, ocupados: 0, reservados: 0, continuan: 0, en_espera: 0, libres: 0 };
    fila.capacidad += g.max_capacity;
    fila.ocupados += g.cupos_ocupados;
    filas.set(clave, fila);
  }
  for (const r of reservas) {
    const fila = filas.get(claveDeCubeta(r));
    if (fila) fila.reservados += 1;
  }
  for (const c of continuan) {
    const fila = filas.get(claveDeCubeta(c));
    if (fila) fila.continuan += 1;
  }
  for (const w of enEspera) {
    const fila = filas.get(claveDeCubeta(w));
    if (fila) fila.en_espera += 1;
  }
  for (const fila of filas.values()) fila.libres = fila.capacidad - fila.ocupados - fila.reservados - fila.continuan;
  return [...filas.values()];
}

export interface DecisionDeReserva {
  accion: 'RESERVAR' | 'ESPERAR';
  /** Por qué espera (para el aviso); vacío si reserva. */
  motivo: string;
}

/**
 * Reservar o esperar: se reserva solo si hay cupo libre **y** nadie que se inscribió antes sigue esperando en esa cubeta (el orden es el de inscripción:
 * nadie se salta la fila). `esperandoAntes` son las solicitudes en espera de esa cubeta inscritas antes que esta.
 */
export function decidirReserva(libres: number, esperandoAntes: number): DecisionDeReserva {
  if (esperandoAntes > 0) {
    return { accion: 'ESPERAR', motivo: `Antes hay ${esperandoAntes} solicitud${esperandoAntes === 1 ? '' : 'es'} en espera para ese grado, sede y jornada: se respeta el orden de inscripción.` };
  }
  if (libres <= 0) return { accion: 'ESPERAR', motivo: 'Ese grado, sede y jornada no tienen cupos libres: queda en lista de espera hasta que se libere uno.' };
  return { accion: 'RESERVAR', motivo: '' };
}
