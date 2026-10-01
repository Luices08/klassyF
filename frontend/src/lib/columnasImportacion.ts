import type { ColumnaGuia } from '../components/ui/GuiaColumnas';
import { ROLES } from '../types/api';
import {
  GENEROS,
  GRUPOS_ETNICOS,
  GRUPOS_SANGUINEOS,
  PARENTESCOS,
  REGIMENES_SALUD,
  TIPOS_DOCUMENTO,
} from '../types/domain';

/**
 * Formato de cada columna de las cargas masivas CSV (M02 usuarios, M03 estudiantes). Los valores permitidos
 * salen de las mismas constantes que usa el resto de la app, para que la guía nunca quede desactualizada.
 * El backend (utils/csv.ts, user.controller, student.service) valida exactamente esto.
 */

const uno = (valores: readonly string[]) => `Uno de: ${valores.join(', ')}`;
const SI_NO = 'SI o NO (vacío = sin dato)';

export const NOTAS_CSV_GENERALES = [
  'El separador puede ser coma (,) o punto y coma (;): se detecta solo. Excel en español guarda con punto y coma.',
  'La primera fila es el encabezado con los nombres de columna de la tabla; el orden no importa.',
  'Puedes guardar como «CSV UTF-8» o «CSV (delimitado por comas)»: las tildes y la ñ se respetan.',
  'Las mayúsculas no importan en los valores de lista (cc = CC). Tamaño máximo del archivo: 2 MB.',
  'Cada fila con error se omite y se informa el motivo; las demás sí se cargan.',
];

export const NOTAS_CSV_USUARIOS = [
  ...NOTAS_CSV_GENERALES,
  'Para varias sedes en sedes_codigos sepáralas con | (barra vertical), p. ej. 111111111112|111111111113.',
  'A cada usuario creado se le asigna una contraseña temporal que deberá cambiar en su primer ingreso.',
];

export const NOTAS_CSV_ESTUDIANTES = [
  ...NOTAS_CSV_GENERALES,
  'Los datos del acudiente son opcionales, pero si llenas alguna columna acudiente_* debes completar todas (tipo de documento aparte: si va vacío se usa CC).',
  'Si llenas rh, eps o regimen_salud, autorizacion_datos_sensibles debe ir en SI (Ley 1581 de 2012, art. 6): son datos sensibles y exigen la autorización explícita del acudiente. Queda registrado el acudiente de la misma fila, si lo diligenciaste.',
  'A cada estudiante creado se le asigna una contraseña temporal que deberá cambiar en su primer ingreso.',
];

export const COLUMNAS_USUARIOS: ColumnaGuia[] = [
  { nombre: 'tipo_documento', obligatoria: true, formato: uno(TIPOS_DOCUMENTO), ejemplo: 'CC' },
  { nombre: 'numero_documento', obligatoria: true, formato: 'Solo el número, sin puntos ni espacios. No puede repetirse.', ejemplo: '1098765432' },
  { nombre: 'nombre', obligatoria: true, formato: 'Texto', ejemplo: 'María' },
  { nombre: 'apellido', obligatoria: true, formato: 'Texto', ejemplo: 'Peña' },
  { nombre: 'email', obligatoria: true, formato: 'Correo válido. No puede repetirse.', ejemplo: 'maria@colegio.edu.co' },
  { nombre: 'rol', obligatoria: true, formato: `${uno(ROLES)}. ADMIN solo lo importa un administrador.`, ejemplo: 'DOCENTE' },
  { nombre: 'telefono', obligatoria: false, formato: 'Texto', ejemplo: '3001112233' },
  {
    nombre: 'sedes_codigos',
    obligatoria: false,
    formato: 'Códigos DANE de sede (12 dígitos) ya creados. Varios separados con |',
    ejemplo: '111111111112|111111111113',
  },
];

export const COLUMNAS_ESTUDIANTES: ColumnaGuia[] = [
  { nombre: 'tipo_documento', obligatoria: true, formato: uno(TIPOS_DOCUMENTO), ejemplo: 'RC' },
  { nombre: 'numero_documento', obligatoria: true, formato: 'Solo el número, sin puntos ni espacios. No puede repetirse.', ejemplo: '1098765432' },
  { nombre: 'nombre', obligatoria: true, formato: 'Texto', ejemplo: 'Sofía' },
  { nombre: 'apellido', obligatoria: true, formato: 'Texto', ejemplo: 'Núñez' },
  { nombre: 'email', obligatoria: true, formato: 'Correo válido. No puede repetirse.', ejemplo: 'sofia@correo.com' },
  {
    nombre: 'fecha_nacimiento',
    obligatoria: true,
    formato: 'Fecha YYYY-MM-DD (año-mes-día). También se acepta DD/MM/AAAA. No puede ser futura.',
    ejemplo: '2015-03-24',
  },
  { nombre: 'genero', obligatoria: false, formato: uno(GENEROS), ejemplo: 'F' },
  { nombre: 'rh', obligatoria: false, formato: uno(GRUPOS_SANGUINEOS), ejemplo: 'O+' },
  { nombre: 'eps', obligatoria: false, formato: 'Texto', ejemplo: 'Sura' },
  { nombre: 'regimen_salud', obligatoria: false, formato: uno(REGIMENES_SALUD), ejemplo: 'CONTRIBUTIVO' },
  {
    nombre: 'autorizacion_datos_sensibles',
    obligatoria: false,
    formato: `${SI_NO}. Obligatoria en SI si llenas rh, eps o regimen_salud.`,
    ejemplo: 'SI',
  },
  { nombre: 'estrato', obligatoria: false, formato: 'Número entero de 1 a 6', ejemplo: '3' },
  { nombre: 'direccion_residencia', obligatoria: false, formato: 'Texto', ejemplo: 'Cra 10 # 20-30' },
  { nombre: 'barrio_vereda', obligatoria: false, formato: 'Texto', ejemplo: 'Centro' },
  { nombre: 'municipio', obligatoria: false, formato: 'Texto', ejemplo: 'Bucaramanga' },
  { nombre: 'grupo_etnico', obligatoria: false, formato: uno(GRUPOS_ETNICOS), ejemplo: 'NINGUNO' },
  { nombre: 'victima_conflicto', obligatoria: false, formato: SI_NO, ejemplo: 'NO' },
  { nombre: 'tiene_discapacidad', obligatoria: false, formato: SI_NO, ejemplo: 'NO' },
  { nombre: 'tiene_talento_excepcional', obligatoria: false, formato: SI_NO, ejemplo: 'NO' },
  { nombre: 'institucion_procedencia', obligatoria: false, formato: 'Texto', ejemplo: 'Colegio Nacional' },
  {
    nombre: 'acudiente_tipo_documento',
    obligatoria: false,
    formato: `${uno(TIPOS_DOCUMENTO)}. Vacío = CC`,
    ejemplo: 'CC',
  },
  { nombre: 'acudiente_numero_documento', obligatoria: false, formato: 'Solo el número. Con datos de acudiente: obligatoria', ejemplo: '63500100' },
  { nombre: 'acudiente_nombre', obligatoria: false, formato: 'Texto. Con datos de acudiente: obligatoria', ejemplo: 'Rosa' },
  { nombre: 'acudiente_apellido', obligatoria: false, formato: 'Texto. Con datos de acudiente: obligatoria', ejemplo: 'Núñez' },
  { nombre: 'acudiente_telefono', obligatoria: false, formato: 'Texto. Con datos de acudiente: obligatoria', ejemplo: '3001112233' },
  { nombre: 'acudiente_parentesco', obligatoria: false, formato: `${uno(PARENTESCOS)}. Con datos de acudiente: obligatoria`, ejemplo: 'MADRE' },
];
