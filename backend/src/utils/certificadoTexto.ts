import { SnapshotCertificado } from './certificados';

export const TIPOS_DOCUMENTO: Record<string, string> = {
  CC: 'cédula de ciudadanía',
  TI: 'tarjeta de identidad',
  CE: 'cédula de extranjería',
  RC: 'registro civil de nacimiento',
  PEP: 'permiso especial de permanencia',
  PPT: 'permiso por protección temporal',
  NES: 'número establecido por la Secretaría de Educación',
};

const JORNADAS: Record<string, string> = { MANANA: 'mañana', TARDE: 'tarde', UNICA: 'única', NOCTURNA: 'nocturna', SABATINA: 'sabatina' };

export const NIVELES: Record<string, string> = { PREESCOLAR: 'Preescolar', PRIMARIA: 'Básica Primaria', SECUNDARIA: 'Básica Secundaria', MEDIA: 'Educación Media' };
export const INGRESOS: Record<string, string> = { NUEVO: 'nuevo(a)', ANTIGUO: 'antiguo(a)', TRASLADO: 'traslado', REPITENTE: 'repitente' };

/** `07:00` → `7:00 a.m.` */
export function hora12(hhmm: string): string {
  const [horas = '0', minutos = '00'] = hhmm.split(':');
  const h = Number(horas);
  return `${h % 12 === 0 ? 12 : h % 12}:${minutos} ${h >= 12 ? 'p.m.' : 'a.m.'}`;
}

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
  /** Solo certificado de estudio: el concepto de promoción, que se dibuja después de la tabla de notas. */
  concepto?: string;
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
  // El nivel y el horario son de documentos recientes; los anteriores se redactan como cuando se expidieron.
  const grado = m.nivel ? `${m.grado} (${NIVELES[m.nivel] ?? m.nivel})` : m.grado;
  const horario = s.tipo === 'CONSTANCIA_ESTUDIO' && m.horario ? ` (de ${hora12(m.horario.inicio)} a ${hora12(m.horario.fin)})` : '';
  const ubicacion = `el grado ${grado}, grupo ${m.grupo}, jornada ${nombreDeJornada(e.jornada)}${horario}, sede ${e.sede}, durante el año lectivo ${m.anio ?? ''}`.replace(/\s+,/g, ',');
  const preambulo = `${e.institucion}, con código DANE ${e.codigo_dane} y NIT ${e.nit}, con reconocimiento oficial según ${e.resolucion_aprobacion},`;
  // Los documentos anteriores al selector guardan el destinatario como texto libre y se redactan igual que cuando se expidieron.
  const cierre = s.destino
    ? `${s.destino.frase}, el ${fechaLarga(s.fecha_expedicion)}.`
    : s.destinatario
      ? `Se expide para presentar ante ${s.destinatario}, el ${fechaLarga(s.fecha_expedicion)}.`
      : `Se expide a solicitud del interesado, el ${fechaLarga(s.fecha_expedicion)}.`;

  if (s.tipo === 'CERTIFICADO_MATRICULA') {
    const retirado = m.estado === 'RETIRADO';
    const clase = m.estado === 'MATRICULADO_CONDICIONAL' ? 'condicional' : 'definitiva';
    const posicion = m.numero_libro !== null && m.numero_folio !== null ? ` (libro ${m.numero_libro}, folio ${m.numero_folio})` : '';
    const folio = m.folio_matricula ? ` registrada en el Libro de Matrícula bajo el folio ${m.folio_matricula}${posicion}` : '';
    const expedido = est.lugar_expedicion ? `, expedido(a) en ${est.lugar_expedicion}` : '';
    const ingreso = m.tipo_ingreso ? ` Condición de ingreso: ${INGRESOS[m.tipo_ingreso] ?? m.tipo_ingreso.toLowerCase()}.` : '';
    const acudiente = s.acudiente
      ? ` Acudiente responsable: ${s.acudiente.nombre.toUpperCase()}, identificado(a) con ${TIPOS_DOCUMENTO[s.acudiente.tipo_documento] ?? s.acudiente.tipo_documento} No. ${s.acudiente.numero_documento} (${s.acudiente.parentesco.toLowerCase().replace(/_/g, ' ')}).`
      : '';
    return {
      preambulo,
      formula: 'CERTIFICA',
      cuerpo:
        `Que ${nombre}, identificado(a) con ${documento}${expedido}, ${retirado ? 'estuvo matriculado(a)' : 'se encuentra matriculado(a)'} en esta institución en ${ubicacion}, ` +
        `con matrícula ${clase} del ${fechaLarga(m.fecha_matricula)},${folio}.` +
        ingreso +
        acudiente +
        (retirado ? ' La matrícula fue retirada; el asiento del Libro de Matrícula se conserva.' : ''),
      cierre,
    };
  }
  if (s.tipo === 'PAZ_SALVO') {
    const dependencias = s.paz_y_salvo?.dependencias ?? [];
    const retirado = m.estado === 'RETIRADO';
    return {
      preambulo,
      formula: 'CERTIFICA',
      cuerpo:
        `Que ${nombre}, identificado(a) con ${documento}, ${retirado ? 'estuvo matriculado(a)' : 'está matriculado(a)'} en ${ubicacion}, ` +
        `y se encuentra a PAZ Y SALVO con la institución por todo concepto, sin compromisos pendientes en las siguientes dependencias: ${dependencias.join(', ')}.` +
        (s.paz_y_salvo ? ` Verificado por ${s.paz_y_salvo.verificado_por}.` : ''),
      cierre,
    };
  }
  if (s.tipo === 'CERTIFICADO_ESTUDIOS') {
    const promocion = s.estudios?.promocion;
    return {
      preambulo,
      formula: 'CERTIFICA',
      cuerpo: `Que ${nombre}, identificado(a) con ${documento}, cursó en esta institución ${ubicacion}, con las siguientes valoraciones finales:`,
      concepto: promocion ? `Concepto de promoción: ${promocion.concepto === 'APROBO' ? 'APROBÓ' : 'NO APROBÓ'} el grado ${m.grado}.` : 'Concepto de promoción: PENDIENTE (aún no registrado).',
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
