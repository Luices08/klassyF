import { Parentesco, TipoDocumento } from '../constants/enums';
import { COLUMNAS_ACUDIENTES, ColumnaAcudientes, MotivoAcudientes, TELEFONO_SIN_DATO } from '../constants/importacionAcudientes';
import { claveDeNombre } from './importacion';
import {
  correoDeSimat,
  documentoDeCelda,
  generoDeSimat,
  normalizarEncabezadoSimat,
  telefonoDeSimat,
  textoDeCelda,
  tipoDocumentoDeSimat,
} from './importacionSimat';

/** Reglas puras de la importación de acudientes (sin base de datos): se prueban con casos sintéticos. */

const COLUMNAS = Object.keys(COLUMNAS_ACUDIENTES) as ColumnaAcudientes[];
const ALIAS = new Map<string, ColumnaAcudientes>(COLUMNAS.flatMap((c) => COLUMNAS_ACUDIENTES[c].alias.map((a) => [normalizarEncabezadoSimat(a), c] as const)));

export interface MapaDeColumnasAcudientes {
  indices: Partial<Record<ColumnaAcudientes, number>>;
  faltantes: ColumnaAcudientes[];
  opcionalesAusentes: ColumnaAcudientes[];
}

export function mapearColumnasAcudientes(encabezados: readonly unknown[]): MapaDeColumnasAcudientes {
  const indices: Partial<Record<ColumnaAcudientes, number>> = {};
  encabezados.forEach((encabezado, i) => {
    const columna = ALIAS.get(normalizarEncabezadoSimat(encabezado));
    if (columna && indices[columna] === undefined) indices[columna] = i;
  });
  return {
    indices,
    faltantes: COLUMNAS.filter((c) => COLUMNAS_ACUDIENTES[c].obligatoria && indices[c] === undefined),
    opcionalesAusentes: COLUMNAS.filter((c) => !COLUMNAS_ACUDIENTES[c].obligatoria && indices[c] === undefined),
  };
}

export type FilaCrudaAcudientes = Partial<Record<ColumnaAcudientes, unknown>>;

export interface FilaAcudiente {
  numero: number;
  tipo_doc_estudiante: TipoDocumento | null;
  doc_estudiante: string;
  nombre_estudiante: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  nombre: string;
  apellido: string;
  parentesco: Parentesco | null;
  telefono_principal: string;
  telefono_secundario: string | null;
  email: string | null;
  direccion: string | null;
  ocupacion: string | null;
  /** null = el archivo no lo dice: el sistema decide (el primero de un estudiante sin principal). */
  es_principal: boolean | null;
  autorizado_retiro: boolean | null;
}

export interface FilaNormalizadaAcudiente {
  fila: FilaAcudiente;
  /** Códigos de error: con alguno la fila no se importa. */
  errores: MotivoAcudientes[];
  avisos: string[];
}

/** SI/NO tolerante (`SI`, `S`, `X`, `1`, `true`). Vacío = null (sin dato); otra cosa = undefined (inválido). */
export function siNoDeCelda(valor: unknown): boolean | null | undefined {
  const k = claveDeNombre(textoDeCelda(valor));
  if (k === '') return null;
  if (['si', 's', 'x', '1', 'true', 'verdadero', 'yes'].includes(k)) return true;
  if (['no', 'n', '0', 'false', 'falso'].includes(k)) return false;
  return undefined;
}

type ResultadoParentesco = { parentesco: Parentesco | null; error: MotivoAcudientes | null; aviso: string | null };

/**
 * SIMAT escribe «ABUELO(A)», «TIO(A)» y «HERMANO(A)»: el género del acudiente decide cuál es. Sin género no se adivina: queda OTRO y se avisa.
 * Un parentesco vacío o que no se reconoce es error (el vínculo legal no se inventa).
 */
export function parentescoDeAcudiente(valor: unknown, genero: 'M' | 'F' | null): ResultadoParentesco {
  const k = claveDeNombre(textoDeCelda(valor).replace(/[()/_]/g, ' '));
  if (k === '') return { parentesco: null, error: 'PARENTESCO_FALTANTE', aviso: null };
  const fijo: Record<string, Parentesco> = {
    madre: 'MADRE',
    padre: 'PADRE',
    abuela: 'ABUELA',
    tia: 'TIA',
    hermana: 'HERMANA',
    'tutor legal': 'TUTOR_LEGAL',
    tutor: 'TUTOR_LEGAL',
    otro: 'OTRO',
  };
  if (fijo[k]) return { parentesco: fijo[k]!, error: null, aviso: null };
  const porGenero: Record<string, [Parentesco, Parentesco]> = {
    abuelo: ['ABUELO', 'ABUELA'],
    'abuelo a': ['ABUELO', 'ABUELA'],
    tio: ['TIO', 'TIA'],
    'tio a': ['TIO', 'TIA'],
    hermano: ['HERMANO', 'HERMANA'],
    'hermano a': ['HERMANO', 'HERMANA'],
  };
  const par = porGenero[k];
  if (!par) return { parentesco: null, error: 'PARENTESCO_INVALIDO', aviso: null };
  // Escrito sin la (A) es masculino; con la (A) decide el género y, sin él, queda OTRO.
  if (k === 'abuelo' || k === 'tio' || k === 'hermano') return { parentesco: par[0], error: null, aviso: null };
  if (genero === 'M') return { parentesco: par[0], error: null, aviso: null };
  if (genero === 'F') return { parentesco: par[1], error: null, aviso: null };
  return { parentesco: 'OTRO', error: null, aviso: `El parentesco «${textoDeCelda(valor)}» no dice si es hombre o mujer y no hay columna de género: se guardó como OTRO.` };
}

const junta = (...partes: Array<string | null | undefined>): string => partes.map((p) => (p ?? '').trim()).filter(Boolean).join(' ');

export function normalizarFilaAcudiente(cruda: FilaCrudaAcudientes, numero: number): FilaNormalizadaAcudiente {
  const errores: MotivoAcudientes[] = [];
  const avisos: string[] = [];

  const docEstudiante = documentoDeCelda(cruda.doc_estudiante);
  if (docEstudiante === null) errores.push('DOC_ESTUDIANTE_INVALIDO');
  let tipoEstudiante: TipoDocumento | null = null;
  if (textoDeCelda(cruda.tipo_doc_estudiante) !== '') {
    tipoEstudiante = tipoDocumentoDeSimat(cruda.tipo_doc_estudiante).tipo;
    if (!tipoEstudiante) errores.push('TIPO_DOC_ESTUDIANTE_NO_SOPORTADO');
  }

  const docAcudiente = documentoDeCelda(cruda.documento);
  if (docAcudiente === null) errores.push('DOC_ACUDIENTE_INVALIDO');
  let tipoAcudiente: TipoDocumento = 'CC';
  if (textoDeCelda(cruda.tipo_documento) !== '') {
    const t = tipoDocumentoDeSimat(cruda.tipo_documento).tipo;
    if (t) tipoAcudiente = t;
    else errores.push('TIPO_DOC_ACUDIENTE_NO_SOPORTADO');
  } else {
    avisos.push('No trae tipo de documento del acudiente: se asumió CC.');
  }

  const nombre1 = textoDeCelda(cruda.nombre1);
  const apellido1 = textoDeCelda(cruda.apellido1);
  if (nombre1 === '' || apellido1 === '') errores.push('DATOS_INCOMPLETOS');

  const genero = generoDeSimat(cruda.genero);
  const p = parentescoDeAcudiente(cruda.parentesco, genero);
  if (p.error) errores.push(p.error);
  if (p.aviso) avisos.push(p.aviso);

  const principal = siNoDeCelda(cruda.es_principal);
  const retiro = siNoDeCelda(cruda.autorizado_retiro);
  if (principal === undefined || retiro === undefined) errores.push('VALOR_INVALIDO');

  const telefonoCrudo = textoDeCelda(cruda.telefono);
  let telefono = telefonoDeSimat(cruda.telefono);
  if (!telefono) {
    if (telefonoCrudo === '') {
      avisos.push('No trae teléfono: se guardó «Sin teléfono». Complétalo en la ficha del acudiente.');
      telefono = TELEFONO_SIN_DATO;
    } else {
      avisos.push(`El teléfono «${telefonoCrudo}» no tiene un formato reconocido: se guardó tal cual.`);
      telefono = telefonoCrudo.slice(0, 30);
    }
  }
  const telefono2Crudo = textoDeCelda(cruda.telefono2);
  const telefono2 = telefonoDeSimat(cruda.telefono2);
  if (telefono2Crudo !== '' && !telefono2) avisos.push(`El segundo teléfono «${telefono2Crudo}» no tiene un formato reconocido y no se guardó.`);

  const correoCrudo = textoDeCelda(cruda.correo);
  const correo = correoDeSimat(cruda.correo);
  if (correoCrudo !== '' && !correo) avisos.push(`El correo «${correoCrudo}» no es válido y no se guardó.`);

  // El barrio no tiene campo propio: va dentro de la dirección.
  const barrio = textoDeCelda(cruda.barrio);
  const direccion = textoDeCelda(cruda.direccion);
  const agregaBarrio = barrio !== '' && !claveDeNombre(direccion).includes(claveDeNombre(barrio));
  const direccionFinal = agregaBarrio ? (direccion ? `${direccion}, Barrio ${barrio}` : `Barrio ${barrio}`) : direccion;
  const ocupacion = textoDeCelda(cruda.ocupacion);

  return {
    fila: {
      numero,
      tipo_doc_estudiante: tipoEstudiante,
      doc_estudiante: docEstudiante ?? textoDeCelda(cruda.doc_estudiante),
      nombre_estudiante: textoDeCelda(cruda.nombre_estudiante),
      tipo_documento: tipoAcudiente,
      numero_documento: docAcudiente ?? textoDeCelda(cruda.documento),
      nombre: junta(nombre1, textoDeCelda(cruda.nombre2)),
      apellido: junta(apellido1, textoDeCelda(cruda.apellido2)),
      parentesco: p.parentesco,
      telefono_principal: telefono,
      telefono_secundario: telefono2,
      email: correo,
      direccion: direccionFinal ? direccionFinal.slice(0, 200) : null,
      ocupacion: ocupacion ? ocupacion.slice(0, 100) : null,
      es_principal: principal ?? null,
      autorizado_retiro: retiro ?? null,
    },
    errores,
    avisos,
  };
}

/**
 * ¿El nombre que trae el archivo corresponde al estudiante que hay en Klassy? Detecta un documento mal digitado. Es una advertencia, no un
 * error: los nombres se escriben distinto (un segundo apellido de más, el orden). Coincide si al menos la mitad de sus palabras están.
 */
export function nombreCoincide(delArchivo: string, delSistema: string): boolean {
  const palabras = (t: string): string[] => claveDeNombre(t).split(' ').filter((w) => w.length > 1);
  const archivo = palabras(delArchivo);
  if (archivo.length === 0) return true;
  const sistema = new Set(palabras(delSistema));
  return archivo.filter((w) => sistema.has(w)).length * 2 >= archivo.length;
}

/** Campos de un acudiente ya registrado que la importación completa porque estaban vacíos (nunca pisa un dato que ya hay). */
export interface AcudienteExistente {
  nombre: string;
  apellido: string;
  tipo_documento: string;
  telefono_principal: string;
  telefono_secundario?: string | null;
  email?: string | null;
  ocupacion?: string | null;
  direccion?: string | null;
}

export function camposACompletar(existente: AcudienteExistente, fila: FilaAcudiente): { campos: string[]; identidad: string[] } {
  const campos: string[] = [];
  const identidad: string[] = [];
  const vacio = (v?: string | null): boolean => !v || v.trim() === '';
  if ((vacio(existente.telefono_principal) || existente.telefono_principal === TELEFONO_SIN_DATO) && fila.telefono_principal !== TELEFONO_SIN_DATO) campos.push('teléfono principal');
  if (vacio(existente.telefono_secundario) && fila.telefono_secundario) campos.push('teléfono secundario');
  if (vacio(existente.email) && fila.email) campos.push('correo');
  if (vacio(existente.ocupacion) && fila.ocupacion) campos.push('ocupación');
  if (vacio(existente.direccion) && fila.direccion) campos.push('dirección');
  if (claveDeNombre(`${existente.nombre} ${existente.apellido}`) !== claveDeNombre(`${fila.nombre} ${fila.apellido}`)) identidad.push('nombre');
  if (existente.tipo_documento !== fila.tipo_documento) identidad.push('tipo de documento');
  return { campos, identidad };
}
