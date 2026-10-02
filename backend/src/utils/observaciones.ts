import { TIPOS_SITUACION, TipoSituacion } from '../constants/convivencia';

const MS_HORA = 3_600_000;

interface DescriptorParaTexto {
  codigo: string | null;
  texto: string;
}

/** Texto final de la observación: una línea por frase elegida (con su código si el manual lo trae) y luego el comentario. */
export function componerTextoObservacion(descriptores: DescriptorParaTexto[], comentario: string): string {
  const lineas = descriptores.map((d) => (d.codigo ? `${d.codigo}. ${d.texto}` : d.texto));
  const libre = comentario.trim();
  if (libre) lineas.push(libre);
  return lineas.join('\n');
}

/** El mayor tipo de situación (I < II < III) entre las frases elegidas; null si ninguna trae. */
export function tipoSituacionMaxima(descriptores: { tipo_situacion: TipoSituacion | null }[]): TipoSituacion | null {
  let maximo = -1;
  for (const d of descriptores) {
    if (d.tipo_situacion) maximo = Math.max(maximo, TIPOS_SITUACION.indexOf(d.tipo_situacion));
  }
  return maximo < 0 ? null : (TIPOS_SITUACION[maximo] ?? null);
}

/** true si todavía no pasó el plazo (en horas) desde `desde`. Plazo 0 = ya vencido desde el primer instante. */
export function dentroDelPlazo(desde: Date, horas: number, ahora: Date = new Date()): boolean {
  return ahora.getTime() - desde.getTime() < horas * MS_HORA;
}

/** Situaciones II y III: su contenido solo lo ve quien gestiona convivencia; el director de grupo ve que existen. */
export const esSituacionGrave = (tipo: TipoSituacion | null): boolean => tipo === 'II' || tipo === 'III';

export type ModoVistaObservacion = 'COMPLETA' | 'RESERVADA' | 'ESTUDIANTE';

interface ObservacionParaVista {
  _id: { toString(): string };
  student_id: { toString(): string };
  fecha_hecho: Date;
  periodo_numero: number | null;
  tipo_id: { toString(): string };
  tipo_nombre: string;
  familia: string;
  tipo_situacion_maxima: TipoSituacion | null;
  descriptores: unknown[];
  comentario: string;
  texto_generado: string;
  contexto: string;
  estado: string;
  autor_id: { toString(): string };
  registrado_por: { toString(): string };
  group_id: { toString(): string };
  evento_id: { toString(): string } | null;
  anulacion: { motivo: string; fecha: Date } | null;
  enmiendas: unknown[];
  createdAt: Date;
}

/**
 * Lo que cada consultante recibe de una observación. Se arma aquí, en un solo lugar, para que ninguna ruta devuelva el
 * documento crudo: `RESERVADA` oculta el contenido (existencia y tipo), `ESTUDIANTE` solo el texto final.
 */
export function vistaObservacion(obs: ObservacionParaVista, modo: ModoVistaObservacion) {
  if (modo === 'ESTUDIANTE') {
    return {
      _id: obs._id.toString(),
      fecha_hecho: obs.fecha_hecho,
      periodo_numero: obs.periodo_numero,
      tipo_nombre: obs.tipo_nombre,
      texto_generado: obs.texto_generado,
    };
  }

  const base = {
    _id: obs._id.toString(),
    student_id: obs.student_id.toString(),
    fecha_hecho: obs.fecha_hecho,
    periodo_numero: obs.periodo_numero,
    tipo_nombre: obs.tipo_nombre,
    familia: obs.familia,
    tipo_situacion_maxima: obs.tipo_situacion_maxima,
    estado: obs.estado,
    createdAt: obs.createdAt,
  };
  if (modo === 'RESERVADA') return { ...base, reservada: true as const };

  return {
    ...base,
    reservada: false as const,
    tipo_id: obs.tipo_id.toString(),
    descriptores: obs.descriptores,
    comentario: obs.comentario,
    texto_generado: obs.texto_generado,
    contexto: obs.contexto,
    autor_id: obs.autor_id.toString(),
    registrado_por: obs.registrado_por.toString(),
    group_id: obs.group_id.toString(),
    evento_id: obs.evento_id ? obs.evento_id.toString() : null,
    anulacion: obs.anulacion ? { motivo: obs.anulacion.motivo, fecha: obs.anulacion.fecha } : null,
    cantidad_enmiendas: obs.enmiendas.length,
  };
}
