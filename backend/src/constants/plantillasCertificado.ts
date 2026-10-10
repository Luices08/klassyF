/**
 * Plantillas de certificados (M26): el texto de cada documento vive en la base de datos (`PlantillaCertificado`) y lo edita el ADMIN.
 * Lo que hay aquí son los VALORES DE PARTIDA (como `POLITICA_INICIAL` o la plantilla de planilla de M12) para que el sistema funcione
 * desde el primer día, y las reglas que una plantilla debe cumplir para poder publicarse. El encabezado institucional (nombre,
 * escudo, DANE, NIT, resolución, sede, jornada, año) lo dibuja siempre el sistema con los datos de M01: no se redacta aquí.
 */
import { A_QUIEN_INTERESE, DefinicionCertificado, FRASE_OTRO_PREDETERMINADA, OpcionDestinatario, TIPOS_INICIALES } from './certificados';

export const ESTILOS_BLOQUE = ['PREAMBULO', 'FORMULA', 'CUERPO', 'DESTACADO', 'TABLA_NOTAS'] as const;
export type EstiloBloque = (typeof ESTILOS_BLOQUE)[number];

export const ETIQUETA_ESTILO_BLOQUE: Record<EstiloBloque, string> = {
  PREAMBULO: 'Quién certifica (centrado)',
  FORMULA: 'Fórmula (HACE CONSTAR / CERTIFICA)',
  CUERPO: 'Párrafo',
  DESTACADO: 'Párrafo destacado',
  TABLA_NOTAS: 'Tabla de valoraciones (la entrega el módulo de notas)',
};

export type TipoCondicion = 'HAY' | 'NO_HAY';

/** Un bloque solo se muestra si el dato existe (HAY) o no existe (NO_HAY): así «Dado en {{ciudad}}» no sale con un hueco. */
export interface CondicionBloque {
  variable: string;
  tipo: TipoCondicion;
}

export interface BloquePlantilla {
  /** Identificador estable dentro de la plantilla (los requisitos legales lo citan). */
  id: string;
  estilo: EstiloBloque;
  texto: string;
  condicion: CondicionBloque | null;
  activo: boolean;
}

export interface ContenidoPlantilla {
  titulo: string;
  bloques: BloquePlantilla[];
  /** Opciones del selector de destinatario/motivo (sin «Otro», que el sistema agrega al final). La primera es la predeterminada. */
  destinatarios: OpcionDestinatario[];
  frase_otro: string;
  /** Días de vigencia del documento; null = sin vigencia. */
  vigencia_dias: number | null;
}

export const MAX_TEXTO_BLOQUE = 1500;
export const MAX_BLOQUES = 14;
export const MAX_DESTINATARIOS = 12;
export const MAX_VIGENCIA_DIAS = 365;

// --- Valores de partida ---

const bloque = (id: string, estilo: EstiloBloque, texto: string, condicion: CondicionBloque | null = null): BloquePlantilla => ({ id, estilo, texto, condicion, activo: true });
const hay = (variable: string): CondicionBloque => ({ variable, tipo: 'HAY' });
const noHay = (variable: string): CondicionBloque => ({ variable, tipo: 'NO_HAY' });

const PREAMBULO = bloque('preambulo', 'PREAMBULO', '{{institucion.nombre}}, con código DANE {{institucion.dane}} y NIT {{institucion.nit}}, con reconocimiento oficial según {{institucion.resolucion}},');
const UBICACION = 'el grado {{matricula.grado}} ({{matricula.nivel}}), grupo {{matricula.grupo}}, jornada {{jornada.nombre}}, sede {{sede.nombre}}, durante el año lectivo {{anio.numero}}';
const DESTINO = bloque('destino', 'CUERPO', '{{destino.frase}}.');
const VIGENCIA = bloque('vigencia', 'CUERPO', 'Este documento tiene una vigencia de {{documento.vigencia}} a partir de su expedición.', hay('documento.vigencia'));
const LUGAR_FECHA = bloque('lugar_fecha', 'CUERPO', 'Dado en {{institucion.ciudad}}, {{fecha.textual}}.', hay('institucion.ciudad'));
const FECHA_SIN_CIUDAD = bloque('fecha', 'CUERPO', 'Fecha de expedición: {{fecha.expedicion}}.', noHay('institucion.ciudad'));

const CONTENIDO_BASE: Record<string, Omit<ContenidoPlantilla, 'titulo' | 'destinatarios' | 'frase_otro'>> = {
  CONSTANCIA_ESTUDIO: {
    vigencia_dias: 30,
    bloques: [
      PREAMBULO,
      bloque('formula', 'FORMULA', 'HACE CONSTAR'),
      bloque('cuerpo', 'CUERPO', `Que {{estudiante.nombre_completo}}, identificado(a) con {{estudiante.documento}}, se encuentra matriculado(a) en esta institución y cursa ${UBICACION.replace('jornada {{jornada.nombre}}', 'jornada {{jornada.nombre}} ({{jornada.horario}})')}.`),
      DESTINO,
      VIGENCIA,
      LUGAR_FECHA,
      FECHA_SIN_CIUDAD,
    ],
  },
  CERTIFICADO_MATRICULA: {
    vigencia_dias: null,
    bloques: [
      PREAMBULO,
      bloque('formula', 'FORMULA', 'CERTIFICA'),
      bloque('cuerpo', 'CUERPO', `Que {{estudiante.nombre_completo}}, identificado(a) con {{estudiante.documento}}, {{matricula.situacion}} en esta institución en ${UBICACION}, con matrícula {{matricula.clase}} del {{matricula.fecha}}, {{matricula.registro_libro}}.`),
      bloque('ingreso', 'CUERPO', 'Condición de ingreso: {{matricula.condicion_ingreso}}.', hay('matricula.condicion_ingreso')),
      bloque('acudiente', 'CUERPO', 'Acudiente responsable: {{acudiente.nombre}}, identificado(a) con {{acudiente.documento}} ({{acudiente.parentesco}}).', hay('acudiente.nombre')),
      bloque('retiro', 'CUERPO', '{{matricula.retiro}}', hay('matricula.retiro')),
      DESTINO,
      VIGENCIA,
      LUGAR_FECHA,
      FECHA_SIN_CIUDAD,
    ],
  },
  PAZ_SALVO: {
    vigencia_dias: null,
    bloques: [
      PREAMBULO,
      bloque('formula', 'FORMULA', 'CERTIFICA'),
      bloque(
        'cuerpo',
        'CUERPO',
        `Que {{estudiante.nombre_completo}}, identificado(a) con {{estudiante.documento}}, {{matricula.situacion}} en esta institución en ${UBICACION}, y se encuentra a PAZ Y SALVO con la institución por todo concepto, sin compromisos pendientes en las siguientes dependencias: {{paz_y_salvo.dependencias}}. Verificado por {{paz_y_salvo.verificado_por}}.`
      ),
      DESTINO,
      VIGENCIA,
      LUGAR_FECHA,
      FECHA_SIN_CIUDAD,
    ],
  },
  CERTIFICADO_ESTUDIOS: {
    vigencia_dias: null,
    bloques: [
      PREAMBULO,
      bloque('formula', 'FORMULA', 'CERTIFICA'),
      bloque('cuerpo', 'CUERPO', `Que {{estudiante.nombre_completo}}, identificado(a) con {{estudiante.documento}}, cursó en esta institución ${UBICACION}, con las siguientes valoraciones finales:`),
      bloque('notas', 'TABLA_NOTAS', ''),
      bloque('promocion', 'DESTACADO', 'Concepto de promoción: {{promocion.texto}}.'),
      DESTINO,
      VIGENCIA,
      LUGAR_FECHA,
      FECHA_SIN_CIUDAD,
    ],
  },
};

/**
 * El texto de partida de un tipo. Los tipos sembrados traen el suyo; uno creado por el colegio arranca con un texto genérico armado con
 * sus fuentes (valoraciones, dependencias) que ya cumple los mínimos, para que se pueda ajustar y no escribir desde cero.
 */
const contenidoGenerico = (def: Pick<DefinicionCertificado, 'fuentes'>): Omit<ContenidoPlantilla, 'titulo' | 'destinatarios' | 'frase_otro'> => {
  const valoraciones = def.fuentes.includes('VALORACIONES');
  const dependencias = def.fuentes.includes('DEPENDENCIAS');
  const verbo = valoraciones ? 'cursó en esta institución' : '{{matricula.situacion}} en esta institución en';
  const cola = valoraciones ? ', con las siguientes valoraciones finales:' : '.';
  return {
    vigencia_dias: null,
    bloques: [
      PREAMBULO,
      bloque('formula', 'FORMULA', 'HACE CONSTAR'),
      bloque('cuerpo', 'CUERPO', `Que {{estudiante.nombre_completo}}, identificado(a) con {{estudiante.documento}}, ${verbo} ${UBICACION}${cola}`),
      ...(valoraciones ? [bloque('notas', 'TABLA_NOTAS', ''), bloque('promocion', 'DESTACADO', 'Concepto de promoción: {{promocion.texto}}.')] : []),
      ...(dependencias
        ? [bloque('dependencias', 'CUERPO', 'Se encuentra a PAZ Y SALVO con la institución en las siguientes dependencias: {{paz_y_salvo.dependencias}}. Verificado por {{paz_y_salvo.verificado_por}}.')]
        : []),
      DESTINO,
      VIGENCIA,
      LUGAR_FECHA,
      FECHA_SIN_CIUDAD,
    ],
  };
};

export function contenidoInicial(def: Pick<DefinicionCertificado, 'clave' | 'nombre' | 'fuentes'>): ContenidoPlantilla {
  const sembrado = TIPOS_INICIALES.find((t) => t.clave === def.clave);
  if (sembrado && CONTENIDO_BASE[def.clave]) {
    return structuredClone({ titulo: sembrado.nombre, destinatarios: sembrado.destinatarios, frase_otro: sembrado.frase_otro, ...(CONTENIDO_BASE[def.clave] as Omit<ContenidoPlantilla, 'titulo' | 'destinatarios' | 'frase_otro'>) });
  }
  return structuredClone({ titulo: def.nombre, destinatarios: [A_QUIEN_INTERESE], frase_otro: FRASE_OTRO_PREDETERMINADA, ...contenidoGenerico(def) });
}

// --- Lo que una plantilla debe conservar para poder publicarse ---

export interface RequisitosLegales {
  /** Variables que deben aparecer en el texto de algún bloque activo. Un arreglo = basta con una de ellas. */
  variables: Array<string | string[]>;
  /** Bloques que no se pueden quitar ni desactivar. */
  bloques: string[];
  /** Qué norma o qué parte del documento maestro lo exige (se muestra al publicar). */
  fuente: string;
}

const IDENTIFICACION = ['estudiante.nombre_completo', ['estudiante.documento', 'estudiante.documento_expedicion'], 'matricula.grado', 'anio.numero'];
const FECHA = [['fecha.expedicion', 'fecha.textual']];

/**
 * Mínimos por documento, derivados de lo que el tipo es (no de su nombre): toda constancia lleva fórmula, cuerpo, la identificación del
 * estudiante y la fecha; las fuentes agregan lo suyo (la tabla de valoraciones y el concepto de promoción, las dependencias) y el tipo
 * puede exigir más variables. El DANE, la resolución de aprobación, el nombre del colegio y el escudo van siempre en el encabezado que
 * dibuja el sistema, así que no dependen de la plantilla. Decreto 180 de 1981 art. 13 (compilado en el Decreto 1075 de 2015) para lo
 * que certifica valoraciones; el documento maestro (M26) para el resto. Validar con el texto vigente de la norma.
 */
export function requisitosDe(def: Pick<DefinicionCertificado, 'fuentes' | 'variables_obligatorias'>): RequisitosLegales {
  const valoraciones = def.fuentes.includes('VALORACIONES');
  const bloques = ['formula', 'cuerpo', ...(valoraciones ? ['notas', 'promocion'] : [])];
  const variables: Array<string | string[]> = [...IDENTIFICACION, ...FECHA];
  if (valoraciones) variables.push('promocion.texto');
  if (def.fuentes.includes('DEPENDENCIAS')) variables.push('paz_y_salvo.dependencias');
  for (const v of def.variables_obligatorias) if (!variables.includes(v)) variables.push(v);
  return { variables, bloques, fuente: valoraciones ? 'Decreto 180 de 1981 art. 13 (Decreto 1075 de 2015) y documento maestro, M26' : 'Documento maestro, M26' };
}
