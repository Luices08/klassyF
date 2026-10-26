// Qué puede pedir una familia al solicitar cupo (M04): solo combinaciones de grado, sede y jornada donde el colegio tiene un grupo activo. Puro y con tests.

export interface OpcionDeOferta {
  grado_id: string;
  sede_id: string;
  /** Nombre de la jornada de la sede (`MANANA`, `TARDE`…): es lo que guarda la solicitud como jornada deseada. */
  jornada: string;
}

export interface PedidoDeCupo {
  grado_id: string;
  sede_id?: string | null;
  jornada?: string | null;
}

/**
 * null si el pedido existe en la oferta; si no, lo que no se ofrece, en palabras para quien solicita. La sede y la jornada son opcionales («sin preferencia»),
 * pero si se eligen deben existir juntas con el grado: un grado puede no estar en una sede, o no en una jornada.
 */
export function motivoDeOfertaNoDisponible(oferta: readonly OpcionDeOferta[], pedido: PedidoDeCupo): string | null {
  if (oferta.length === 0) return 'El colegio aún no tiene grupos abiertos para recibir solicitudes. Intenta más adelante.';
  const delGrado = oferta.filter((o) => o.grado_id === pedido.grado_id);
  if (delGrado.length === 0) return 'Ese grado no se ofrece por ahora. Elige otro.';
  const enSede = pedido.sede_id ? delGrado.filter((o) => o.sede_id === pedido.sede_id) : delGrado;
  if (enSede.length === 0) return 'Ese grado no se ofrece en la sede elegida. Elige otra sede o déjala sin preferencia.';
  if (pedido.jornada && !enSede.some((o) => o.jornada === pedido.jornada)) {
    return pedido.sede_id ? 'Ese grado no se ofrece en esa jornada en la sede elegida. Elige otra jornada o déjala sin preferencia.' : 'Ese grado no se ofrece en esa jornada. Elige otra jornada o déjala sin preferencia.';
  }
  return null;
}
