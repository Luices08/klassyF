import type { ColumnaGuia } from '../components/ui/GuiaColumnas';

/**
 * Guía del archivo de la importación masiva de acudientes (M03). Describe lo que el servidor hace de verdad con cada columna
 * (backend/src/constants/importacionAcudientes.ts, utils/importacionAcudientes.ts y services/importacionAcudientes.service.ts): al cambiar una
 * regla de allá se cambia aquí. `backend/tests/importacionAcudientes.test.ts` comprueba que las columnas coinciden.
 *
 * Archivo sin dependencias de React a propósito: lo lee también esa prueba del backend.
 */

export const NOTAS_ACUDIENTES = [
  'Descarga la plantilla (Excel o CSV) y diligénciala: trae los encabezados exactos, listas desplegables y una hoja con instrucciones. SIMAT no exporta acudientes, por eso el archivo se arma con la información que tenga la secretaría.',
  'Cada fila une a UN estudiante con UN acudiente. Si un acudiente tiene varios hijos en el colegio, repite sus datos en una fila por cada hijo: se crea una sola vez y se vincula a cada uno.',
  'Los estudiantes deben existir antes: créalos a mano, por la carga masiva de estudiantes o impórtalos desde SIMAT. Una fila cuyo estudiante no existe no se importa; créalo y vuelve a subir el archivo.',
  'Las columnas se buscan por su nombre, no por su posición: da igual si van en mayúsculas o minúsculas, con tildes o sin ellas, con espacios o con guion bajo. La primera fila es el encabezado. Excel (.xlsx), CSV o TXT, hasta 10 MB y 8.000 filas. No debe haber fórmulas.',
  'Antes de guardar, Klassy te muestra qué pasaría con cada fila y tú confirmas con tu contraseña. Las filas con error no se importan; las demás sí. Puedes corregir el archivo y volver a subirlo: lo ya importado se reconoce y no se duplica.',
  'Un acudiente que ya existe (mismo documento) se reutiliza: solo se completan sus datos vacíos. Su nombre y su tipo de documento no se cambian; si difieren, se informa en el detalle de la fila.',
  'Principal (responsable legal): si el archivo no trae ES_PRINCIPAL, el primer acudiente de cada estudiante que aún no tiene principal queda como principal. Con ES_PRINCIPAL = SI, reemplaza al principal actual.',
  'No se crean cuentas del portal por defecto. Puedes pedirlo al revisar el archivo: solo se abre la del acudiente principal de un estudiante con la matrícula ya confirmada, con su documento como contraseña temporal.',
];

const ESTUDIANTE = 'Identifican al estudiante (debe existir)';
const ACUDIENTE = 'Datos del acudiente';
const CONTACTO = 'Contacto';
const VINCULO = 'Vínculo con el estudiante';
const SIN_DESTINO = 'Se reconocen, pero no se guardan';

export const COLUMNAS_ACUDIENTES_GUIA: ColumnaGuia[] = [
  { grupo: ESTUDIANTE, nombre: 'DOC_EST', obligatoria: true, formato: 'Número de documento del estudiante: de 3 a 20 letras o números, sin puntos ni espacios. Excel puede guardarlo como número.', ejemplo: '1109672200', uso: 'Busca al estudiante en Klassy. Si no existe, la fila queda con error («importa o crea primero al estudiante»). Si es de una persona que no es estudiante, también.' },
  { grupo: ESTUDIANTE, nombre: 'TIPODOC_EST', obligatoria: false, formato: 'CC, TI, RC, CE, PEP, PPT o NES.', ejemplo: 'TI', uso: 'Solo se compara con el tipo que tiene el estudiante en Klassy: si no coincide, se avisa en la fila.' },
  { grupo: ESTUDIANTE, nombre: 'NOMBRE_ESTUDIANTE', obligatoria: false, formato: 'Texto.', ejemplo: 'Santiago Abad', uso: 'Para reconocer la fila. Si no se parece al nombre del estudiante en Klassy se avisa: suele ser un documento mal digitado. No cambia ningún dato.' },

  { grupo: ACUDIENTE, nombre: 'DOC_ACUDIENTE', obligatoria: true, formato: 'Número de documento del acudiente: de 3 a 20 letras o números, sin puntos ni espacios.', ejemplo: '31852960', uso: 'Es la llave del acudiente: si ya existe en Klassy se reutiliza esa persona. No puede ser el documento del propio estudiante ni el de otro estudiante.' },
  { grupo: ACUDIENTE, nombre: 'TIPODOC_ACUDIENTE', obligatoria: false, formato: 'CC, CE, PEP, PPT, TI, RC o NES. Vacío = CC.', ejemplo: 'CC', uso: 'Un tipo que no existe deja la fila con error. Vacío: se asume CC y se avisa.' },
  { grupo: ACUDIENTE, nombre: 'APELLIDO1', obligatoria: true, formato: 'Texto.', ejemplo: 'Pérez', uso: 'Primer apellido. Vacío: la fila queda con error.' },
  { grupo: ACUDIENTE, nombre: 'APELLIDO2', obligatoria: false, formato: 'Texto. Vacío si no tiene.', ejemplo: 'Gómez', uso: 'Se une al primer apellido en un solo campo.' },
  { grupo: ACUDIENTE, nombre: 'NOMBRE1', obligatoria: true, formato: 'Texto.', ejemplo: 'Kelly', uso: 'Primer nombre. Vacío: la fila queda con error.' },
  { grupo: ACUDIENTE, nombre: 'NOMBRE2', obligatoria: false, formato: 'Texto. Vacío si no tiene.', ejemplo: 'Andrea', uso: 'Se une al primer nombre en un solo campo.' },
  { grupo: ACUDIENTE, nombre: 'OCUPACION', obligatoria: false, formato: 'Texto.', ejemplo: 'Docente', uso: 'Se guarda como ocupación.' },

  { grupo: CONTACTO, nombre: 'TELEFONO', obligatoria: false, formato: 'Celular de 10 dígitos (empieza por 3) o fijo de 7. Acepta varios separados por / o -: se toma el primero que sirva. También se lee como CELULAR.', ejemplo: '3001112233', uso: 'Teléfono principal. Si falta se guarda «Sin teléfono» y se avisa; si el formato no se reconoce se guarda tal cual, con aviso.' },
  { grupo: CONTACTO, nombre: 'TELEFONO2', obligatoria: false, formato: 'Igual que TELEFONO. También se lee como TEL_CONTACTO.', ejemplo: '3109998877', uso: 'Teléfono secundario. Si no se reconoce, no se guarda y se avisa.' },
  { grupo: CONTACTO, nombre: 'CORREO', obligatoria: false, formato: 'Correo electrónico válido. También se lee como EMAIL.', ejemplo: 'kelly@correo.com', uso: 'Se guarda en minúsculas. Lo necesitan el portal y las citaciones. Uno inválido no se guarda y se avisa.' },
  { grupo: CONTACTO, nombre: 'DIRECCION', obligatoria: false, formato: 'Texto.', ejemplo: 'Cra 10 # 20-30', uso: 'Dirección de residencia.' },
  { grupo: CONTACTO, nombre: 'BARRIO', obligatoria: false, formato: 'Texto.', ejemplo: 'Centro', uso: 'Klassy no tiene un campo de barrio del acudiente: se agrega al final de la dirección («Cra 10 # 20-30, Barrio Centro»).' },

  { grupo: VINCULO, nombre: 'PARENTESCO', obligatoria: true, formato: 'MADRE, PADRE, ABUELO(A), TIO(A), HERMANO(A), TUTOR LEGAL u OTRO.', ejemplo: 'MADRE', uso: 'Vacío o con otro valor: la fila queda con error (el vínculo legal no se adivina). En los que llevan (A) decide GENERO; sin género se guarda como OTRO y se avisa.' },
  { grupo: VINCULO, nombre: 'GENERO', obligatoria: false, formato: 'FEMENINO o MASCULINO (también F / M).', ejemplo: 'FEMENINO', uso: 'Solo sirve para resolver ABUELO(A), TIO(A) y HERMANO(A). No se guarda.' },
  { grupo: VINCULO, nombre: 'ES_PRINCIPAL', obligatoria: false, formato: 'SI o NO. Vacío = lo decide el sistema.', ejemplo: 'SI', uso: 'El principal es el responsable legal: firma la matrícula y recibe las citaciones. Dos principales para el mismo estudiante en el archivo: la segunda fila queda con error.' },
  { grupo: VINCULO, nombre: 'AUTORIZADO_RETIRO', obligatoria: false, formato: 'SI o NO. Vacío = SI.', ejemplo: 'SI', uso: 'Si puede retirar al estudiante del colegio.' },

  { grupo: SIN_DESTINO, nombre: 'NIVEL_EDUCATIVO', obligatoria: false, formato: 'Texto.', ejemplo: 'SECUNDARIA', uso: 'Klassy no registra la escolaridad del acudiente: se ignora.' },
];
