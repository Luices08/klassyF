export interface DestinoAsistente {
  ruta: string;
  nombre: string;
  descripcion: string;
  /** La pantalla sabe abrirse ya posicionada en un grado (`?grado=<id>`). */
  acepta_grado: boolean;
}

export interface GradoAsistente {
  id: string;
  nombre: string;
}

export interface RespuestaAsistente {
  ruta: string | null;
  grado_id: string | null;
  mensaje: string;
}

interface SalidaDelModelo {
  ruta?: unknown;
  grado_id?: unknown;
  mensaje?: unknown;
}

const MENSAJE_SIN_RESPUESTA = 'No encontré una pantalla para eso. Prueba con otras palabras.';

/**
 * El modelo solo propone: aquí se descarta cualquier ruta o grado que no estuviera en la lista
 * que se le dio (una pregunta con instrucciones inventadas no puede mandar a otro lugar).
 */
export function validarRespuesta(
  salida: SalidaDelModelo,
  destinos: DestinoAsistente[],
  grados: GradoAsistente[]
): RespuestaAsistente {
  const mensaje =
    typeof salida.mensaje === 'string' && salida.mensaje.trim() ? salida.mensaje.trim().slice(0, 400) : MENSAJE_SIN_RESPUESTA;
  const destino = destinos.find((d) => d.ruta === salida.ruta);
  if (!destino) return { ruta: null, grado_id: null, mensaje };

  const grado = destino.acepta_grado ? grados.find((g) => g.id === salida.grado_id) : undefined;
  return { ruta: destino.ruta, grado_id: grado?.id ?? null, mensaje };
}
