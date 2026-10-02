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

/** Pendiente y con la fecha límite ya pasada (la fecha límite del día de hoy todavía no está vencida). */
export function esCompromisoVencido(compromiso: { estado: string; fecha_limite: Date }, hoy: Date): boolean {
  return compromiso.estado === 'PENDIENTE' && compromiso.fecha_limite < hoy;
}

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
  compromisos: { _id: { toString(): string }; descripcion: string; responsable: string; fecha_limite: Date; estado: string; fecha_cierre: Date | null; nota_cierre: string }[];
  citaciones: { _id: { toString(): string }; fecha: Date; medio: string; dirigida_a: string; resultado: string }[];
  solicitud_caso: { estado: string; origen: string; motivo: string; fecha: Date; motivo_resolucion: string } | null;
  createdAt: Date;
}

/**
 * Lo que cada consultante recibe de una observación. Se arma aquí, en un solo lugar, para que ninguna ruta devuelva el
 * documento crudo: `RESERVADA` oculta el contenido (existencia y tipo), `ESTUDIANTE` solo el texto final.
 */
/** `hoy` es el día de calendario de hoy (Colombia, medianoche UTC): con él se calculan los compromisos vencidos. */
export function vistaObservacion(obs: ObservacionParaVista, modo: ModoVistaObservacion, hoy: Date = new Date()) {
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
    compromisos: obs.compromisos.map((c) => ({
      _id: c._id.toString(),
      descripcion: c.descripcion,
      responsable: c.responsable,
      fecha_limite: c.fecha_limite,
      estado: c.estado,
      vencido: esCompromisoVencido(c, hoy),
      fecha_cierre: c.fecha_cierre,
      nota_cierre: c.nota_cierre,
    })),
    citaciones: obs.citaciones.map((c) => ({
      _id: c._id.toString(),
      fecha: c.fecha,
      medio: c.medio,
      dirigida_a: c.dirigida_a,
      resultado: c.resultado,
    })),
    solicitud_caso: obs.solicitud_caso
      ? {
          estado: obs.solicitud_caso.estado,
          origen: obs.solicitud_caso.origen,
          motivo: obs.solicitud_caso.motivo,
          fecha: obs.solicitud_caso.fecha,
          motivo_resolucion: obs.solicitud_caso.motivo_resolucion,
        }
      : null,
  };
}
