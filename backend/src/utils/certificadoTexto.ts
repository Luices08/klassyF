import { SnapshotCertificado } from './certificados';

const TIPOS_DOCUMENTO: Record<string, string> = {
  CC: 'cédula de ciudadanía',
  TI: 'tarjeta de identidad',
  CE: 'cédula de extranjería',
  RC: 'registro civil de nacimiento',
  PEP: 'permiso especial de permanencia',
  PPT: 'permiso por protección temporal',
  NES: 'número establecido por la Secretaría de Educación',
};

const JORNADAS: Record<string, string> = { MANANA: 'mañana', TARDE: 'tarde', UNICA: 'única', NOCTURNA: 'nocturna', SABATINA: 'sabatina' };

export const nombreDeJornada = (jornada: string): string => JORNADAS[jornada] ?? jornada.toLowerCase();

/** Fecha larga en hora de Colombia: las fechas del documento no deben correrse un día según el servidor. */
export const fechaLarga = (iso: string): string =>
  new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' });

export interface TextoCertificado {
  /** Quién certifica. */
  preambulo: string;
  /** La fórmula que abre el cuerpo (en mayúsculas, centrada). */
  formula: string;
  cuerpo: string;
  cierre: string;
}

/**
 * El texto sale del snapshot congelado y de nada más. No se asume el género de la persona (el sistema no lo usa para
 * certificar): se redacta con «matriculado(a)».
 */
export function redactarCertificado(s: SnapshotCertificado): TextoCertificado {
  const e = s.encabezado;
  const est = s.estudiante;
  const m = s.matricula;
  const nombre = `${est.apellido} ${est.nombre}`.toUpperCase();
  const documento = `${TIPOS_DOCUMENTO[est.tipo_documento] ?? est.tipo_documento} No. ${est.numero_documento}`;
  const ubicacion = `el grado ${m.grado}, grupo ${m.grupo}, jornada ${nombreDeJornada(e.jornada)}, sede ${e.sede}, durante el año lectivo ${m.anio ?? ''}`.replace(/\s+,/g, ',');
  const preambulo = `${e.institucion}, con código DANE ${e.codigo_dane} y NIT ${e.nit}, con reconocimiento oficial según ${e.resolucion_aprobacion},`;
  const cierre = s.destinatario
    ? `Se expide para presentar ante ${s.destinatario}, el ${fechaLarga(s.fecha_expedicion)}.`
    : `Se expide a solicitud del interesado, el ${fechaLarga(s.fecha_expedicion)}.`;

  if (s.tipo === 'CERTIFICADO_MATRICULA') {
    const retirado = m.estado === 'RETIRADO';
    const clase = m.estado === 'MATRICULADO_CONDICIONAL' ? 'condicional' : 'definitiva';
    const posicion = m.numero_libro !== null && m.numero_folio !== null ? ` (libro ${m.numero_libro}, folio ${m.numero_folio})` : '';
    const folio = m.folio_matricula ? ` registrada en el Libro de Matrícula bajo el folio ${m.folio_matricula}${posicion}` : '';
    return {
      preambulo,
      formula: 'CERTIFICA',
      cuerpo:
        `Que ${nombre}, identificado(a) con ${documento}, ${retirado ? 'estuvo matriculado(a)' : 'se encuentra matriculado(a)'} en esta institución en ${ubicacion}, ` +
        `con matrícula ${clase} del ${fechaLarga(m.fecha_matricula)},${folio}.` +
        (retirado ? ' La matrícula fue retirada; el asiento del Libro de Matrícula se conserva.' : ''),
      cierre,
    };
  }
  return {
    preambulo,
    formula: 'HACE CONSTAR',
    cuerpo: `Que ${nombre}, identificado(a) con ${documento}, se encuentra matriculado(a) en esta institución y cursa ${ubicacion}.`,
    cierre,
  };
}
