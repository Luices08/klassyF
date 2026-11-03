import type { ColumnaGuia } from '../components/ui/GuiaColumnas';

/**
 * Guía del archivo plano de SIMAT para la importación de matrículas (M04). Describe lo que el servidor hace de verdad con cada columna
 * (backend/src/constants/importacionSimat.ts, utils/importacionSimat.ts y services/importacionSimat.service.ts): al cambiar una regla de
 * allá se cambia aquí. `backend/tests/guiaSimat.test.ts` comprueba que las columnas obligatorias, las leídas y las ignoradas coinciden.
 *
 * Archivo sin dependencias de React a propósito: lo lee también esa prueba del backend.
 */

export const NOTAS_SIMAT = [
  'Sube el archivo tal como lo exporta SIMAT (.xlsx, .csv o .txt, hasta 25 MB). No hace falta quitar columnas, reordenarlas ni borrar las filas de otros colegios: el sistema toma lo que necesita y deja el resto.',
  'Las columnas se buscan por su nombre, no por su posición. Da igual si van en mayúsculas o minúsculas, con tildes o sin ellas, con espacios o con guion bajo (SISBEN IV = SISBEN_IV). La primera fila debe ser el encabezado.',
  'Si el libro de Excel trae varias hojas (tabla dinámica, convenciones…), se usa la que tiene el encabezado de SIMAT. No debe haber fórmulas: pega solo valores.',
  'Solo se importan las filas cuyo DANE es el de tu institución (el archivo de la Secretaría trae todos los colegios; las demás se cuentan y se descartan sin guardarse). Máximo 8.000 estudiantes de tu institución por archivo y un solo año.',
  'Los nombres de las columnas obligatorias deben estar en el encabezado. Si falta alguna, el archivo se rechaza y se te dice cuál. Lo que sí es opcional se omite sin problema; el sistema avisa qué datos no se podrán sincronizar.',
  'Cada fila queda en una de cinco situaciones: estudiante nuevo, ya registrado, omitida (no corresponde importarla, p. ej. un estudiante retirado o una jornada que Klassy no maneja), requiere decisión (hay una diferencia con Klassy que alguien debe resolver) o con errores (un dato obligatorio es inválido). Nada se guarda hasta que confirmes.',
  'Un dato vacío o «NO APLICA» en SIMAT nunca borra un dato que Klassy ya tiene, y el nombre, la fecha de nacimiento y el género de un estudiante que ya existe no se sobrescriben: si difieren, se informa.',
  'SIMAT no trae el acudiente, la dirección de residencia, el régimen de salud ni el lugar de expedición del documento: quien se crea queda marcado «Importado de SIMAT · por revisar» hasta que secretaría registre su acudiente.',
];

const IDENTIFICA = 'Identifican al estudiante';
const UBICA = 'Ubican la matrícula';
const PERSONALES = 'Datos personales y de contacto que se guardan';
const SENSIBLES = 'Salud y apoyos (datos sensibles)';
const RECONOCIDAS = 'Se reconocen, pero no se usan';
const IGNORADAS = 'No se leen: se ignoran aunque estén en el archivo';
const RESERVADAS = 'Nunca se leen (reservadas por ley)';

const SE_IGNORA = 'Se ignora.';

export const COLUMNAS_SIMAT_GUIA: ColumnaGuia[] = [
  // ---------------------------------------------------------------------------------------------------------------------
  { grupo: IDENTIFICA, nombre: 'DOC', obligatoria: true, formato: 'Número de documento: de 3 a 20 letras o números, sin puntos ni espacios (los NES llevan letras). Excel puede guardarlo como número.', ejemplo: '1098765432', uso: 'Es el documento del estudiante en Klassy. Vacío o inválido: la fila queda con error. Si se repite en el archivo, las dos filas quedan con error. Si ya existe en Klassy se actualiza ese estudiante; si es de una persona que no es estudiante, la fila requiere decisión.' },
  { grupo: IDENTIFICA, nombre: 'TIPODOC', obligatoria: true, formato: 'TI, RC, CC, CE, PEP, PPT o NES. SIMAT lo escribe «TI:TARJETA DE IDENTIDAD»: solo se lee lo que va antes de los dos puntos.', ejemplo: 'TI:TARJETA DE IDENTIDAD', uso: 'Otros tipos (VISA, NUIP, NIP…) no existen en Klassy: la fila se omite.' },
  { grupo: IDENTIFICA, nombre: 'APELLIDO1', obligatoria: true, formato: 'Texto.', ejemplo: 'NUÑEZ', uso: 'Primer apellido, se guarda en mayúsculas. Vacío: la fila queda con error.' },
  { grupo: IDENTIFICA, nombre: 'APELLIDO2', obligatoria: false, formato: 'Texto. Vacío si no tiene.', ejemplo: 'ROJAS', uso: 'Segundo apellido, se guarda en mayúsculas.' },
  { grupo: IDENTIFICA, nombre: 'NOMBRE1', obligatoria: true, formato: 'Texto.', ejemplo: 'SOFIA', uso: 'Primer nombre, se guarda en mayúsculas. Vacío: la fila queda con error.' },
  { grupo: IDENTIFICA, nombre: 'NOMBRE2', obligatoria: false, formato: 'Texto. Vacío si no tiene.', ejemplo: 'VALENTINA', uso: 'Segundo nombre, se guarda en mayúsculas. Los nombres se guardan tal como vienen, en sus cuatro partes: nunca se parten por adivinación.' },
  { grupo: IDENTIFICA, nombre: 'FECHA_NACIMIENTO', obligatoria: true, formato: 'Fecha válida y no futura: celda de fecha de Excel, AAAA-MM-DD o DD/MM/AAAA.', ejemplo: '2015-03-24', uso: 'Vacía, inválida o futura: la fila queda con error. En un estudiante que ya existe no se sobrescribe; si difiere de Klassy, se informa.' },
  { grupo: IDENTIFICA, nombre: 'GENERO', obligatoria: false, formato: 'MASCULINO o FEMENINO.', ejemplo: 'FEMENINO', uso: 'Se guarda como M o F. Otro valor o vacío: queda sin dato (no impide importar).' },
  { grupo: IDENTIFICA, nombre: 'PER_ID', obligatoria: false, formato: 'Número que identifica a la persona en SIMAT.', ejemplo: '71234567', uso: 'Se guarda en la hoja de vida y sirve para reconocer a quien cambió de documento (de RC a TI): ese caso requiere decisión en lugar de crear un duplicado. Si se repite en el archivo, esas filas quedan con error.' },
  { grupo: IDENTIFICA, nombre: 'NUI', obligatoria: false, formato: 'Texto del Número Único de Identificación de SIMAT.', ejemplo: 'NUI123456789', uso: 'Se guarda en la hoja de vida.' },

  // ---------------------------------------------------------------------------------------------------------------------
  { grupo: UBICA, nombre: 'ANO', obligatoria: true, formato: 'Año de 4 dígitos (también se acepta el encabezado AÑO o VIGENCIA). Un solo año por archivo.', ejemplo: '2026', uso: 'Debe existir en Klassy un año lectivo de ese año que no esté cerrado (se crea en «Año lectivo»); si no, el archivo no se puede revisar. Si el archivo mezcla años, se rechaza.' },
  { grupo: UBICA, nombre: 'ESTADO', obligatoria: true, formato: 'Estado de la matrícula en SIMAT: MATRICULADO, RETIRADO, etc.', ejemplo: 'MATRICULADO', uso: 'Solo MATRICULADO se matricula. RETIRADO no se matricula (si en Klassy el estudiante sigue matriculado, la fila requiere decisión). Cualquier otro estado (NUEVO, INSCRITO, ASIGNADO, ASIGNADO POR CONTINUIDAD, SIN CONTINUIDAD, REPROBADO, GRADUADO…) se omite: todavía no es una matrícula confirmada.' },
  { grupo: UBICA, nombre: 'DANE', obligatoria: true, formato: 'Código DANE del establecimiento: 12 dígitos.', ejemplo: '176892000159', uso: 'Solo se importan las filas con el DANE de tu institución (el de Configuración institucional). Las filas sin DANE (aspirantes sin colegio asignado) también se ignoran.' },
  { grupo: UBICA, nombre: 'CODIGO_DANE_SEDE', obligatoria: true, formato: 'Código DANE de la sede: 12 dígitos (también se acepta DANE SEDE).', ejemplo: '176892000345', uso: 'Debe ser el código de una sede ya registrada en Klassy («Sedes y jornadas»); las sedes no se crean solas. Si no está registrada, esa fila se omite. Secretaría solo importa las sedes que tiene asignadas.' },
  { grupo: UBICA, nombre: 'SEDE', obligatoria: false, formato: 'Nombre de la sede.', ejemplo: 'SEDE PRINCIPAL', uso: 'Solo se muestra en la revisión y en los avisos. La sede se identifica por su código, no por el nombre.' },
  { grupo: UBICA, nombre: 'JORNADA', obligatoria: true, formato: 'MAÑANA, TARDE, ÚNICA, NOCTURNA o FIN DE SEMANA.', ejemplo: 'MAÑANA', uso: 'Se traduce a la jornada de Klassy (FIN DE SEMANA = sabatina) y esa sede debe tenerla configurada; si no, la fila se omite. COMPLETA y cualquier otra jornada no tienen equivalente en Klassy: la fila se omite.' },
  { grupo: UBICA, nombre: 'GRADO_COD', obligatoria: true, formato: 'Número: -2 Pre-jardín, -1 Jardín, 0 Transición, 1 a 11 (también se acepta GRADO).', ejemplo: '6', uso: 'El grado debe existir y estar activo en el catálogo de grados. Los ciclos de jóvenes y adultos (21 a 26) y la aceleración (99) todavía no se soportan: esas filas se omiten.' },
  { grupo: UBICA, nombre: 'GRUPO', obligatoria: true, formato: 'Código del grupo, número o texto: 601, 1001, JRD.', ejemplo: '601', uso: 'Es la nomenclatura del grupo. Si ese grupo no existe en la sede, jornada y grado, Klassy lo crea al aplicar (sin docentes, plan de estudios ni horario) con el cupo que indiques. Si el código no empieza por el grado (601 es de sexto) solo se avisa. Sin grupo: la fila queda con error.' },
  { grupo: UBICA, nombre: 'FECHAINI', obligatoria: false, formato: 'Fecha y hora de la matrícula en SIMAT: celda de fecha de Excel o AAAA-MM-DD hh:mm.', ejemplo: '2026-01-15 10:00:00', uso: 'Es la fecha de la matrícula en Klassy y fija el orden en que se asientan los folios del Libro de Matrícula (la más antigua primero). Sin fecha, esa fila va al final.' },

  // ---------------------------------------------------------------------------------------------------------------------
  { grupo: PERSONALES, nombre: 'BARRIO', obligatoria: false, formato: 'Texto.', ejemplo: 'LA ESTANCIA', uso: 'Se guarda en mayúsculas como barrio o vereda. SIMAT no trae la dirección de residencia completa.' },
  { grupo: PERSONALES, nombre: 'TELEFONO', obligatoria: false, formato: 'Celular de 10 dígitos que empieza por 3 (con o sin el 57) o fijo de 7 dígitos. Si trae varios, separados por /, coma, ; o guion, se toma el primero utilizable.', ejemplo: '3127984925', uso: 'Se guarda como teléfono del estudiante. Si ninguno sirve, queda vacío y se avisa.' },
  { grupo: PERSONALES, nombre: 'CORREO', obligatoria: false, formato: 'Correo con formato válido.', ejemplo: 'familia@correo.com', uso: 'Se guarda como correo de contacto (no es el correo para iniciar sesión). Si no tiene formato válido, se descarta y se avisa.' },
  { grupo: PERSONALES, nombre: 'ESTRATO', obligatoria: false, formato: 'ESTRATO 1 a ESTRATO 6.', ejemplo: 'ESTRATO 2', uso: 'Se guarda el número. ESTRATO 0 (se avisa) y NO APLICA quedan vacíos: Klassy guarda estratos de 1 a 6.' },
  { grupo: PERSONALES, nombre: 'SISBEN IV', obligatoria: false, formato: 'Grupo A1 a A5, B1 a B7, C1 a C18 o D1 a D21. NO APLICA o vacío = sin SISBEN.', ejemplo: 'B2', uso: 'Se guarda el grupo. Un valor que no es un grupo válido se deja vacío y se avisa.' },
  { grupo: PERSONALES, nombre: 'ETNIA', obligatoria: false, formato: 'Uno de los valores de SIMAT (afrodescendiente, negritudes, raizal, palenquero, rom, o el nombre de un pueblo indígena) o NO APLICA.', ejemplo: 'NO APLICA', uso: 'Se agrupa en la categoría de Klassy: afrodescendiente (afro…, negritudes), raizal, palenquero, rom (o gitano); cualquier otro pueblo se guarda como indígena. El valor de SIMAT se conserva como detalle. NO APLICA o vacío: sin dato.' },
  { grupo: PERSONALES, nombre: 'PAIS_ORIGEN', obligatoria: false, formato: 'Nombre del país.', ejemplo: 'COLOMBIA', uso: 'Se guarda en mayúsculas. NO APLICA y NO ESPECIFICADO quedan vacíos.' },
  { grupo: PERSONALES, nombre: 'PAIS_NACIMIENTO', obligatoria: false, formato: 'Nombre del país.', ejemplo: 'VENEZUELA', uso: 'Se guarda en mayúsculas. NO APLICA y NO ESPECIFICADO quedan vacíos.' },
  { grupo: PERSONALES, nombre: 'PAIS_NACIONALIDAD2', obligatoria: false, formato: 'Nombre del país (segunda nacionalidad).', ejemplo: 'NO_APLICA', uso: 'Se guarda en mayúsculas como segunda nacionalidad. NO APLICA y NO ESPECIFICADO quedan vacíos.' },

  // ---------------------------------------------------------------------------------------------------------------------
  { grupo: SENSIBLES, nombre: 'EPS', obligatoria: false, formato: 'Nombre de la EPS.', ejemplo: 'SURA', uso: 'Dato de salud (Ley 1581 de 2012): solo se importa si, al subir el archivo, declaras que el colegio cuenta con la autorización de las familias. Si no lo declaras, se omite y se avisa; lo demás sí se importa.' },
  { grupo: SENSIBLES, nombre: 'TIPO DE SANGRE', obligatoria: false, formato: 'A+, A-, B+, B-, AB+, AB-, O+ u O-, con o sin espacio («O +»).', ejemplo: 'O +', uso: 'Igual que la EPS: solo con la autorización declarada. Un valor no reconocido queda vacío y se avisa.' },
  { grupo: SENSIBLES, nombre: 'DISCAPACIDAD', obligatoria: false, formato: 'El tipo de discapacidad de SIMAT, o NO APLICA / vacío si no tiene.', ejemplo: 'DISCAPACIDAD INTELECTUAL', uso: 'Con cualquier valor, la hoja de vida queda marcada con discapacidad y se transcribe el texto; la solicitud llega sola a orientación. No abre un PIAR ni guarda la categoría: orientación valora cada caso.' },
  { grupo: SENSIBLES, nombre: 'TRA_ESP_APR_ESCOLAR', obligatoria: false, formato: 'Trastorno de aprendizaje de SIMAT (TDAH, trastorno de aprendizaje escolar…), o NO APLICA / vacío.', ejemplo: 'NO APLICA', uso: 'Si trae un valor y el estudiante no tiene discapacidad, al crear su matrícula queda una solicitud de apoyo para orientación con ese texto. No es un diagnóstico.' },
  { grupo: SENSIBLES, nombre: 'LIST_CAP_EXCEPCIONALES', obligatoria: false, formato: 'Capacidad o talento excepcional de SIMAT, o NO APLICA / vacío.', ejemplo: 'NO APLICA', uso: 'Cualquier valor distinto de NO APLICA marca «talento excepcional» en la hoja de vida.' },

  // ---------------------------------------------------------------------------------------------------------------------
  { grupo: RECONOCIDAS, nombre: 'INSTITUCION', obligatoria: false, formato: 'Nombre del establecimiento (también ESTABLECIMIENTO).', ejemplo: 'IE ANTONIA SANTOS', uso: 'Se reconoce, pero no se usa: la institución se identifica por el DANE.' },
  { grupo: RECONOCIDAS, nombre: 'MODELO', obligatoria: false, formato: 'Modelo educativo.', ejemplo: 'EDUCACIÓN TRADICIONAL', uso: 'Se reconoce, pero no se usa.' },

  // ---------------------------------------------------------------------------------------------------------------------
  { grupo: IGNORADAS, nombre: 'ETC', obligatoria: false, formato: 'Cualquiera.', ejemplo: 'YUMBO', uso: SE_IGNORA },
  { grupo: IGNORADAS, nombre: 'JERARQUIA', obligatoria: false, formato: 'Cualquiera.', ejemplo: 'YUMBO', uso: SE_IGNORA },
  { grupo: IGNORADAS, nombre: 'CALENDARIO', obligatoria: false, formato: 'Cualquiera.', ejemplo: 'A', uso: SE_IGNORA },
  { grupo: IGNORADAS, nombre: 'SECTOR', obligatoria: false, formato: 'Cualquiera.', ejemplo: 'OFICIAL', uso: SE_IGNORA },
  { grupo: IGNORADAS, nombre: 'CONSECUTIVO', obligatoria: false, formato: 'Cualquiera.', ejemplo: '—', uso: SE_IGNORA },
  { grupo: IGNORADAS, nombre: 'ZONA_SEDE', obligatoria: false, formato: 'Cualquiera.', ejemplo: 'URBANA', uso: SE_IGNORA },
  { grupo: IGNORADAS, nombre: 'RENOMBRE', obligatoria: false, formato: 'Cualquiera.', ejemplo: '602', uso: 'Se ignora: el grupo se toma siempre de la columna GRUPO.' },
  { grupo: IGNORADAS, nombre: 'MOTIVO', obligatoria: false, formato: 'Cualquiera.', ejemplo: 'NO CONTINUÓ EN EL ESTABLECIMIENTO EDUCATIVO', uso: SE_IGNORA },
  { grupo: IGNORADAS, nombre: 'FECHAFIN', obligatoria: false, formato: 'Cualquiera.', ejemplo: '(vacía)', uso: 'Se ignora (SIMAT la deja siempre vacía): un retirado no se retira solo desde aquí porque no trae fecha de salida.' },
  { grupo: IGNORADAS, nombre: 'MATRICULACONTRATADA', obligatoria: false, formato: 'Cualquiera.', ejemplo: 'N', uso: SE_IGNORA },
  { grupo: IGNORADAS, nombre: 'FUENTE_RECURSOS', obligatoria: false, formato: 'Cualquiera.', ejemplo: 'SGP', uso: SE_IGNORA },
  { grupo: IGNORADAS, nombre: 'INTERNADO', obligatoria: false, formato: 'Cualquiera.', ejemplo: 'NINGUNO', uso: SE_IGNORA },
  { grupo: IGNORADAS, nombre: 'NUM_CONTRATO', obligatoria: false, formato: 'Cualquiera.', ejemplo: '(vacía)', uso: SE_IGNORA },
  { grupo: IGNORADAS, nombre: 'APOYO_ACADEMICO_ESPECIAL', obligatoria: false, formato: 'Cualquiera.', ejemplo: 'AULA HOSPITALARIA', uso: SE_IGNORA },
  { grupo: IGNORADAS, nombre: 'CAMPESINO', obligatoria: false, formato: 'Cualquiera.', ejemplo: 'N', uso: SE_IGNORA },
  { grupo: IGNORADAS, nombre: 'CATEGORIA_AULA', obligatoria: false, formato: 'Cualquiera.', ejemplo: 'OTRO', uso: SE_IGNORA },
  { grupo: IGNORADAS, nombre: 'CONTADOR', obligatoria: false, formato: 'Cualquiera.', ejemplo: '1', uso: SE_IGNORA },

  // ---------------------------------------------------------------------------------------------------------------------
  { grupo: RESERVADAS, nombre: 'HA_ESTADO_VINCULADO_SRPA', obligatoria: false, formato: 'Cualquiera.', ejemplo: 'NO', uso: 'Dato reservado (Sistema de Responsabilidad Penal para Adolescentes, Ley 1098 de 2006): nunca se lee ni llega a la memoria, a la base de datos o al informe, aunque esté en el archivo.' },
  { grupo: RESERVADAS, nombre: 'ESTA_ACTIVO_SRPA', obligatoria: false, formato: 'Cualquiera.', ejemplo: 'NO', uso: 'Dato reservado (Ley 1098 de 2006): nunca se lee, igual que la anterior.' },
];
