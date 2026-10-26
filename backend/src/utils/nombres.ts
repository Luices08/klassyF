// Nombre de una persona a partir de sus cuatro partes (primer y segundo nombre, primer y segundo apellido), como las pide SIMAT. Puro y con tests.

export interface PartesDeNombre {
  primer_nombre?: string | null;
  segundo_nombre?: string | null;
  primer_apellido?: string | null;
  segundo_apellido?: string | null;
}

/** Quita espacios de más (los del borde y los dobles) sin tocar mayúsculas ni tildes. */
const limpio = (valor: string | null | undefined): string => (valor ?? '').trim().replace(/\s+/g, ' ');

export interface NombreResuelto {
  /** Lo que guarda `User.nombre`: primer y segundo nombre juntos. */
  nombre: string;
  /** Lo que guarda `User.apellido`: primer y segundo apellido juntos. */
  apellido: string;
  /** Las partes tal como se escribieron; vacías si el nombre llegó sin separar (carga anterior). */
  partes: { primer_nombre?: string; segundo_nombre?: string; primer_apellido?: string; segundo_apellido?: string };
}

/**
 * El nombre que se guarda: con el primer nombre y el primer apellido, el nombre y el apellido se **arman** de las cuatro partes (nunca se parten a partir
 * de un texto). Sin ellos, se acepta el nombre y el apellido ya completos (cargas y scripts anteriores) y las partes quedan vacías. null si no alcanza para
 * ninguna de las dos formas.
 */
export function resolverNombre(entrada: PartesDeNombre & { nombre?: string | null; apellido?: string | null }): NombreResuelto | null {
  const pn = limpio(entrada.primer_nombre);
  const sn = limpio(entrada.segundo_nombre);
  const pa = limpio(entrada.primer_apellido);
  const sa = limpio(entrada.segundo_apellido);
  if (pn && pa) {
    return {
      nombre: [pn, sn].filter(Boolean).join(' '),
      apellido: [pa, sa].filter(Boolean).join(' '),
      partes: { primer_nombre: pn, ...(sn ? { segundo_nombre: sn } : {}), primer_apellido: pa, ...(sa ? { segundo_apellido: sa } : {}) },
    };
  }
  const nombre = limpio(entrada.nombre);
  const apellido = limpio(entrada.apellido);
  return nombre && apellido ? { nombre, apellido, partes: {} } : null;
}

export const MENSAJE_NOMBRE_INCOMPLETO = 'Escribe al menos el primer nombre y el primer apellido.';
