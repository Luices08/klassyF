import { createHash } from 'crypto';
import { CLAVE_DESTINATARIO_OTRO, ClaveCertificado, DefinicionCertificado, ETIQUETA_FUENTE, FUENTES_ENTIDAD, MARCA_ENTIDAD } from '../constants/certificados';
import {
  BloquePlantilla,
  ContenidoPlantilla,
  ESTILOS_BLOQUE,
  MAX_BLOQUES,
  MAX_DESTINATARIOS,
  MAX_TEXTO_BLOQUE,
  MAX_VIGENCIA_DIAS,
  requisitosDe,
} from '../constants/plantillasCertificado';
import { CLAVES_VARIABLES, VARIABLES_CERTIFICADO } from '../constants/variablesCertificado';
import { serializacionEstable } from './comiteConvivencia';
import { INGRESOS, NIVELES, TIPOS_DOCUMENTO, fechaLarga, hora12, nombreDeJornada } from './certificadoTexto';
import { BloqueResuelto, SnapshotCertificado } from './certificados';
import { enLetras } from './numerosEnLetras';

const PATRON_VARIABLE = /\{\{\s*([a-z_]+(?:\.[a-z_]+)*)\s*\}\}/g;

export const variablesDeTexto = (texto: string): string[] => [...texto.matchAll(PATRON_VARIABLE)].map((m) => m[1] as string);

const etiquetaDe = (clave: string): string => VARIABLES_CERTIFICADO.find((v) => v.clave === clave)?.etiqueta ?? clave;
const origenDe = (clave: string): string => VARIABLES_CERTIFICADO.find((v) => v.clave === clave)?.origen ?? '';

// --- Validación (lo que se exige al publicar) ---

/**
 * Revisa una plantilla antes de publicarla. Devuelve TODOS los problemas, no el primero: el editor los lista. Incluye los mínimos
 * legales del documento (`requisitosDe`): una plantilla que los pierde no se publica.
 */
export function validarContenido(tipo: Pick<DefinicionCertificado, 'fuentes' | 'variables_obligatorias'>, c: ContenidoPlantilla): string[] {
  const errores: string[] = [];
  const fuentes = tipo.fuentes;
  if (c.titulo.trim().length < 3 || c.titulo.length > 100) errores.push('El título del documento lleva entre 3 y 100 caracteres.');
  if (c.bloques.length === 0 || c.bloques.length > MAX_BLOQUES) errores.push(`La plantilla lleva entre 1 y ${MAX_BLOQUES} bloques.`);

  const ids = new Set<string>();
  for (const b of c.bloques) {
    if (!/^[a-z0-9_-]{1,40}$/.test(b.id)) errores.push(`El bloque «${b.id}» tiene un identificador inválido.`);
    if (ids.has(b.id)) errores.push(`Hay dos bloques con el identificador «${b.id}».`);
    ids.add(b.id);
    if (!(ESTILOS_BLOQUE as readonly string[]).includes(b.estilo)) errores.push(`El bloque «${b.id}» tiene un estilo desconocido.`);
    if (b.estilo === 'TABLA_NOTAS') {
      if (!fuentes.includes('VALORACIONES')) errores.push('La tabla de valoraciones solo existe en los documentos que usan la fuente «Valoraciones y promoción».');
      continue;
    }
    if (b.texto.length > MAX_TEXTO_BLOQUE) errores.push(`El bloque «${b.id}» supera ${MAX_TEXTO_BLOQUE} caracteres.`);
    if (b.activo && b.texto.trim().length === 0) errores.push(`El bloque «${b.id}» está activo pero vacío.`);
    const sinVariables = b.texto.replace(PATRON_VARIABLE, '');
    if (/\{\{|\}\}/.test(sinVariables)) errores.push(`El bloque «${b.id}» tiene llaves {{ }} mal cerradas o una variable con formato inválido.`);
    for (const v of variablesDeTexto(b.texto)) {
      const variable = VARIABLES_CERTIFICADO.find((x) => x.clave === v);
      if (!variable) errores.push(`El bloque «${b.id}» usa la variable desconocida «${v}».`);
      else if (variable.fuente && !fuentes.includes(variable.fuente)) errores.push(`La variable «${v}» no aplica a este documento: necesita la fuente «${ETIQUETA_FUENTE[variable.fuente].nombre}».`);
    }
  }
  if (c.bloques.filter((b) => b.estilo === 'TABLA_NOTAS').length > 1) errores.push('Solo puede haber una tabla de valoraciones.');
  for (const b of c.bloques) {
    if (b.condicion && !CLAVES_VARIABLES.has(b.condicion.variable)) errores.push(`La condición del bloque «${b.id}» usa una variable desconocida.`);
  }

  const requisitos = requisitosDe(tipo);
  for (const id of requisitos.bloques) {
    const b = c.bloques.find((x) => x.id === id);
    if (!b || !b.activo) errores.push(`El bloque «${id}» es obligatorio en este documento (${requisitos.fuente}) y no se puede quitar ni desactivar.`);
  }
  const textoActivo = c.bloques.filter((b) => b.activo).map((b) => b.texto).join('\n');
  const presentes = new Set(variablesDeTexto(textoActivo));
  for (const requerida of requisitos.variables) {
    const alternativas = Array.isArray(requerida) ? requerida : [requerida];
    if (!alternativas.some((v) => presentes.has(v))) {
      errores.push(`Falta el dato «${alternativas.map(etiquetaDe).join('» o «')}» (${requisitos.fuente}).`);
    }
  }

  if (c.vigencia_dias !== null && (!Number.isInteger(c.vigencia_dias) || c.vigencia_dias < 1 || c.vigencia_dias > MAX_VIGENCIA_DIAS)) {
    errores.push(`La vigencia va de 1 a ${MAX_VIGENCIA_DIAS} días, o sin vigencia.`);
  }
  if (c.vigencia_dias === null) {
    for (const b of c.bloques.filter((x) => x.activo && variablesDeTexto(x.texto).includes('documento.vigencia'))) {
      if (!(b.condicion?.variable === 'documento.vigencia' && b.condicion.tipo === 'HAY')) {
        errores.push(`El bloque «${b.id}» usa la vigencia, pero el documento no tiene: ponle la condición «solo si hay vigencia» o define los días.`);
      }
    }
  }

  if (c.destinatarios.length === 0 || c.destinatarios.length > MAX_DESTINATARIOS) errores.push(`El selector lleva entre 1 y ${MAX_DESTINATARIOS} opciones (además de «Otro»).`);
  const claves = new Set<string>();
  for (const d of c.destinatarios) {
    if (!/^[A-Z0-9_]{2,40}$/.test(d.clave) || d.clave === CLAVE_DESTINATARIO_OTRO) errores.push(`La opción «${d.etiqueta}» tiene una clave inválida.`);
    if (claves.has(d.clave)) errores.push(`Hay dos opciones con la clave «${d.clave}».`);
    claves.add(d.clave);
    if (d.etiqueta.trim().length < 2 || d.etiqueta.length > 80) errores.push(`El nombre de la opción «${d.clave}» lleva entre 2 y 80 caracteres.`);
    if (d.frase.trim().length < 5 || d.frase.length > 200 || /\{\{|\}\}/.test(d.frase)) errores.push(`La frase de «${d.etiqueta}» lleva entre 5 y 200 caracteres y sin variables.`);
    if (d.fuente_entidad && !(FUENTES_ENTIDAD as readonly string[]).includes(d.fuente_entidad)) errores.push(`La opción «${d.etiqueta}» toma la entidad de una fuente desconocida.`);
    if (d.fuente_entidad && !d.frase.includes(MARCA_ENTIDAD)) errores.push(`La frase de «${d.etiqueta}» toma la entidad de otro módulo: debe llevar ${MARCA_ENTIDAD} donde va su nombre.`);
    if (!d.fuente_entidad && d.frase.includes(MARCA_ENTIDAD)) errores.push(`La frase de «${d.etiqueta}» lleva ${MARCA_ENTIDAD} pero la opción no indica de dónde sale la entidad.`);
  }
  if (!c.frase_otro.includes('{texto}') || c.frase_otro.length > 200) errores.push('La frase de «Otro» debe contener {texto} y no pasar de 200 caracteres.');
  return errores;
}

/** Lo que define el contenido de una versión, sin los datos de control (se usa con el documento de la base y con uno armado a mano). */
export const contenidoDe = (p: { titulo: string; bloques: BloquePlantilla[]; destinatarios: ContenidoPlantilla['destinatarios']; frase_otro: string; vigencia_dias?: number | null }): ContenidoPlantilla => ({
  titulo: p.titulo,
  bloques: p.bloques.map((b) => ({ id: b.id, estilo: b.estilo, texto: b.texto, condicion: b.condicion ? { variable: b.condicion.variable, tipo: b.condicion.tipo } : null, activo: b.activo })),
  // `fuente_entidad` solo viaja cuando la opción la tiene: así la huella de una plantilla anterior no cambia.
  destinatarios: p.destinatarios.map((d) => ({ clave: d.clave, etiqueta: d.etiqueta, frase: d.frase, ...(d.fuente_entidad ? { fuente_entidad: d.fuente_entidad } : {}) })),
  frase_otro: p.frase_otro,
  vigencia_dias: p.vigencia_dias ?? null,
});

/** Si algún bloque activo usa una variable con ese prefijo (`acudiente.`): así solo se leen y congelan los datos que el documento realmente pone. */
export const usaVariablesCon = (c: Pick<ContenidoPlantilla, 'bloques'>, prefijo: string): boolean =>
  c.bloques.some((b) => b.activo && b.estilo !== 'TABLA_NOTAS' && variablesDeTexto(b.texto).some((v) => v.startsWith(prefijo)));

/** Huella del contenido de una versión: identifica qué texto exacto produjo un documento. */
export const huellaDeContenido = (clave: ClaveCertificado, c: ContenidoPlantilla): string =>
  createHash('sha256').update(serializacionEstable({ clave, ...c })).digest('hex');

// --- Valores de las variables a partir de lo que se congela al expedir ---

export function vigenciaEnTexto(dias: number): string {
  return dias === 1 ? 'un (1) día calendario' : `${enLetras(dias)} (${dias}) días calendario`;
}

const partesDeFecha = (iso: string) => {
  const f = new Date(iso);
  const en = (opciones: Intl.DateTimeFormatOptions) => f.toLocaleDateString('es-CO', { ...opciones, timeZone: 'America/Bogota' });
  return { dia: Number(en({ day: 'numeric' })), mes: en({ month: 'long' }), anio: en({ year: 'numeric' }) };
};

/** «a los nueve (9) días del mes de octubre de 2026» (hora de Colombia). */
export function fechaTextual(iso: string): string {
  const { dia, mes, anio } = partesDeFecha(iso);
  return dia === 1 ? `al primer (1) día del mes de ${mes} de ${anio}` : `a los ${enLetras(dia)} (${dia}) días del mes de ${mes} de ${anio}`;
}

/** Cada variable del catálogo con su valor; vacío = el dato no existe (el bloque que lo exige no se muestra o no se expide). */
export function contextoDeVariables(s: SnapshotCertificado, vigenciaDias: number | null): Record<string, string> {
  const e = s.encabezado;
  const est = s.estudiante;
  const m = s.matricula;
  const retirado = m.estado === 'RETIRADO';
  const documento = `${TIPOS_DOCUMENTO[est.tipo_documento] ?? est.tipo_documento} No. ${est.numero_documento}`;
  const posicion = m.numero_libro !== null && m.numero_folio !== null ? ` (libro ${m.numero_libro}, folio ${m.numero_folio})` : '';
  const a = s.acudiente;
  const promocion = s.estudios
    ? s.estudios.promocion
      ? `${s.estudios.promocion.concepto === 'APROBO' ? 'APROBÓ' : 'NO APROBÓ'} el grado ${m.grado}`
      : 'PENDIENTE (aún no registrado)'
    : '';
  return {
    'institucion.nombre': e.institucion,
    'institucion.dane': e.codigo_dane,
    'institucion.nit': e.nit,
    'institucion.resolucion': e.resolucion_aprobacion,
    'institucion.ciudad': e.ciudad ?? '',
    'institucion.departamento': e.departamento ?? '',
    'sede.nombre': e.sede,
    'jornada.nombre': nombreDeJornada(e.jornada),
    'jornada.horario': m.horario ? `de ${hora12(m.horario.inicio)} a ${hora12(m.horario.fin)}` : '',
    'estudiante.nombre_completo': `${est.apellido} ${est.nombre}`.toUpperCase(),
    'estudiante.documento': documento,
    'estudiante.documento_expedicion': `${documento}${est.lugar_expedicion ? `, expedido(a) en ${est.lugar_expedicion}` : ''}`,
    'matricula.grado': m.grado,
    'matricula.nivel': m.nivel ? (NIVELES[m.nivel] ?? m.nivel) : '',
    'matricula.grupo': m.grupo,
    'anio.numero': m.anio === null ? '' : String(m.anio),
    'matricula.situacion': retirado ? 'estuvo matriculado(a)' : 'se encuentra matriculado(a)',
    'matricula.clase': m.estado === 'MATRICULADO_CONDICIONAL' ? 'condicional' : 'definitiva',
    'matricula.fecha': fechaLarga(m.fecha_matricula),
    'matricula.registro_libro': m.folio_matricula ? `registrada en el Libro de Matrícula bajo el folio ${m.folio_matricula}${posicion}` : '',
    'matricula.condicion_ingreso': m.tipo_ingreso ? (INGRESOS[m.tipo_ingreso] ?? m.tipo_ingreso.toLowerCase()) : '',
    'matricula.retiro': retirado ? 'La matrícula fue retirada; el asiento del Libro de Matrícula se conserva.' : '',
    'acudiente.nombre': a ? a.nombre.toUpperCase() : '',
    'acudiente.documento': a ? `${TIPOS_DOCUMENTO[a.tipo_documento] ?? a.tipo_documento} No. ${a.numero_documento}` : '',
    'acudiente.parentesco': a ? a.parentesco.toLowerCase().replace(/_/g, ' ') : '',
    'fecha.expedicion': fechaLarga(s.fecha_expedicion),
    'fecha.textual': fechaTextual(s.fecha_expedicion),
    'destino.frase': s.destino?.frase ?? '',
    'documento.vigencia': vigenciaDias ? vigenciaEnTexto(vigenciaDias) : '',
    'paz_y_salvo.dependencias': s.paz_y_salvo?.dependencias.join(', ') ?? '',
    'paz_y_salvo.verificado_por': s.paz_y_salvo?.verificado_por ?? '',
    'promocion.texto': promocion,
  };
}

// --- Renderizado ---

export interface ResultadoRenderizado {
  bloques: BloqueResuelto[];
  /** Datos que un bloque visible necesita y no existen: con alguno no se expide. */
  errores: string[];
}

const seMuestra = (b: BloquePlantilla, contexto: Record<string, string>): boolean => {
  if (!b.activo) return false;
  if (!b.condicion) return true;
  const hayValor = (contexto[b.condicion.variable] ?? '').trim() !== '';
  return b.condicion.tipo === 'HAY' ? hayValor : !hayValor;
};

export function renderizar(c: ContenidoPlantilla, contexto: Record<string, string>): ResultadoRenderizado {
  const errores: string[] = [];
  const bloques: BloqueResuelto[] = [];
  for (const b of c.bloques) {
    if (!seMuestra(b, contexto)) continue;
    if (b.estilo === 'TABLA_NOTAS') {
      bloques.push({ estilo: 'TABLA_NOTAS', texto: '' });
      continue;
    }
    const texto = b.texto.replace(PATRON_VARIABLE, (_todo, clave: string) => {
      const valor = contexto[clave] ?? '';
      if (valor.trim() === '') errores.push(`Falta el dato «${etiquetaDe(clave)}» (${origenDe(clave)}), que usa el bloque «${b.id}».`);
      return valor;
    });
    bloques.push({ estilo: b.estilo, texto });
  }
  return { bloques, errores: [...new Set(errores)] };
}
