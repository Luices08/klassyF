import ExcelJS from 'exceljs';
import { Types } from 'mongoose';
import { MAX_BYTES_EXCEL_NOTAS } from '../constants/notas';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { exigirPesosValidos } from './casillasBloque.service';
import { actualizarCasilla, crearCasilla, establecerPesos } from './columnasPlanilla.service';
import { CeldaPlanilla, guardarCeldas, obtenerPlanilla, Planilla } from './notas.service';
import { armarPlanillaDeMuestra } from './planillaMuestra.service';

const HOJA_PLANILLA = 'Planilla';
// La hoja de datos viaja con el archivo: dice a qué clase y periodo pertenece y qué significa cada columna, así subirlo no
// depende de lo que el docente tenga seleccionado en pantalla. Está oculta.
const HOJA_DATOS = 'Datos';
const FILA_BLOQUES = 2;
const FILA_NOMBRES = 3;
const FILA_PESOS = 4;
const FILA_EFECTIVO = 5;
const FILA_INICIAL = 6;
const FILA_LLAVES = 5;
// Casillas en blanco que se ofrecen por bloque: el molde puede permitir hasta 50, pero una hoja con tantas columnas vacías no se usa.
const MAX_CASILLAS_EN_BLANCO = 30;
// La protección de la hoja es una comodidad (evita borrar una fórmula sin querer), no la seguridad: al importar, el servidor
// ignora las columnas calculadas y vuelve a validar cada nota contra la base.
const CLAVE_PROTECCION = 'klassy-notas';
const ASIGNACION_DE_MUESTRA = 'MUESTRA';
// Versión de la instantánea que viaja en la hoja `Datos`; sin ella el servidor no puede saber qué cambió el docente.
const VERSION_INSTANTANEA = 'v1';
const FIRMA_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

type TipoColumna = 'DOCUMENTO' | 'ESTUDIANTE' | 'CASILLA' | 'NUEVA' | 'BLOQUE' | 'NOTA' | 'DESEMPENO' | 'ESTADO';

interface Columna {
  indice: number;
  tipo: TipoColumna;
  /** Id de la casilla, clave del bloque (NUEVA/BLOQUE) o nombre fijo. */
  clave: string;
  encabezado: string;
  /** Peso puesto por el docente (null = automático). Solo en CASILLA. */
  peso?: number | null;
  pesoEfectivo?: number;
  /** El título de una actividad lo manda Actividades y tareas: no se edita desde la hoja. */
  tituloFijo?: boolean;
}

const letra = (n: number): string => {
  let resto = n;
  let texto = '';
  while (resto > 0) {
    const m = (resto - 1) % 26;
    texto = String.fromCharCode(65 + m) + texto;
    resto = Math.floor((resto - 1) / 26);
  }
  return texto;
};

const comillas = (texto: string): string => texto.replace(/"/g, '""');

/**
 * Descarga la planilla de la clase en Excel (también abre en Google Sheets). Cada bloque del molde del colegio trae sus casillas
 * (las que ya existen y espacios en blanco hasta el máximo del bloque): el docente escribe el nombre, el peso y las notas, y
 * al subirla las casillas nuevas se crean. Las fórmulas y los promedios van protegidos.
 */
export async function generarPlantillaNotas(
  asignacionId: string,
  periodoNumero: number,
  docente: UserDocument
): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  return construirLibroPlanilla(await obtenerPlanilla(asignacionId, periodoNumero, docente), asignacionId, periodoNumero);
}

/**
 * El Excel de muestra del administrador: el molde del año con tres estudiantes y dos casillas por bloque inventados, para ver
 * cómo lo recibe el docente. Lleva la marca `MUESTRA` en lugar de una clase, así que no se puede subir como planilla.
 */
export async function generarExcelDeMuestra(academicYearId: string): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const planilla = await armarPlanillaDeMuestra(academicYearId);
  const { buffer } = await construirLibroPlanilla(planilla, ASIGNACION_DE_MUESTRA, planilla.periodo.numero);
  return { buffer, nombreArchivo: 'muestra-planilla-de-notas.xlsx' };
}

async function construirLibroPlanilla(planilla: Planilla, asignacionId: string, periodoNumero: number): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const rangos = [...planilla.escala.rangos].sort((x, y) => y.valor_minimo - x.valor_minimo);
  const editable = planilla.edicion.puede_editar;

  // --- Columnas ---
  const columnas: Columna[] = [
    { indice: 1, tipo: 'DOCUMENTO', clave: 'documento', encabezado: 'Documento' },
    { indice: 2, tipo: 'ESTUDIANTE', clave: 'estudiante', encabezado: 'Estudiante' },
  ];
  const bloques: Array<{ nombre: string; clave: string; porcentaje: number; desde: number; hasta: number; primera: number; ultima: number; columnaBloque: number }> = [];
  for (const bloque of planilla.bloques) {
    const desde = columnas.length + 1;
    for (const casilla of bloque.casillas) {
      columnas.push({
        indice: columnas.length + 1,
        tipo: 'CASILLA',
        clave: casilla.id,
        encabezado: casilla.titulo,
        peso: casilla.peso,
        pesoEfectivo: casilla.peso_efectivo,
        tituloFijo: casilla.tipo === 'ACTIVIDAD',
      });
    }
    const enBlanco = Math.max(0, Math.min(bloque.max_casillas, MAX_CASILLAS_EN_BLANCO) - bloque.casillas.length);
    for (let i = 0; i < enBlanco; i += 1) {
      columnas.push({ indice: columnas.length + 1, tipo: 'NUEVA', clave: bloque.clave, encabezado: '', peso: null, pesoEfectivo: 0 });
    }
    const primera = desde;
    const ultima = columnas.length;
    columnas.push({ indice: columnas.length + 1, tipo: 'BLOQUE', clave: bloque.clave, encabezado: `Nota ${bloque.nombre}` });
    bloques.push({ nombre: bloque.nombre, clave: bloque.clave, porcentaje: bloque.porcentaje, desde, hasta: columnas.length, primera, ultima, columnaBloque: columnas.length });
  }
  const colNota = columnas.length + 1;
  columnas.push({ indice: colNota, tipo: 'NOTA', clave: 'nota', encabezado: 'Nota de la asignatura' });
  columnas.push({ indice: colNota + 1, tipo: 'DESEMPENO', clave: 'desempeno', encabezado: 'Desempeño' });
  columnas.push({ indice: colNota + 2, tipo: 'ESTADO', clave: 'estado', encabezado: 'Estado' });

  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(HOJA_PLANILLA, { views: [{ state: 'frozen', xSplit: 2, ySplit: FILA_EFECTIVO }] });
  const contexto = planilla.asignacion;
  const { plantilla } = planilla;
  hoja.getCell('A1').value = `${plantilla.titulo} — ${contexto?.asignatura?.nombre ?? 'Asignatura'} · Grupo ${contexto?.grupo?.nomenclatura ?? ''} · Periodo ${planilla.periodo.numero} (${planilla.periodo.nombre})`;
  hoja.getCell('A1').font = { bold: true, size: 13 };

  // --- Encabezados ---
  for (const b of bloques) {
    const max = planilla.bloques.find((x) => x.clave === b.clave)?.max_casillas ?? 0;
    hoja.mergeCells(FILA_BLOQUES, b.desde, FILA_BLOQUES, b.hasta);
    const celda = hoja.getCell(FILA_BLOQUES, b.desde);
    celda.value = `${b.nombre} (${b.porcentaje}%) — hasta ${max} casilla${max === 1 ? '' : 's'}`;
    celda.alignment = { horizontal: 'center' };
    celda.font = { bold: true };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF3FF' } };
  }
  for (const c of columnas) {
    const celda = hoja.getCell(FILA_NOMBRES, c.indice);
    celda.value = c.encabezado || null;
    celda.font = { bold: true };
    celda.alignment = { wrapText: true, vertical: 'middle', horizontal: c.tipo === 'ESTUDIANTE' ? 'left' : 'center' };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.tipo === 'CASILLA' || c.tipo === 'NUEVA' ? 'FFFFFFFF' : 'FFF1F5F9' } };
    if (c.tipo === 'CASILLA' || c.tipo === 'NUEVA') {
      celda.protection = { locked: !editable || Boolean(c.tituloFijo) };
      const peso = hoja.getCell(FILA_PESOS, c.indice);
      peso.value = c.peso ?? null;
      peso.numFmt = '0.##';
      peso.alignment = { horizontal: 'center' };
      peso.font = { italic: true, color: { argb: 'FF788794' } };
      peso.protection = { locked: !editable };
      peso.dataValidation = {
        type: 'decimal',
        operator: 'between',
        allowBlank: true,
        formulae: [0, 100],
        showErrorMessage: true,
        errorTitle: 'Peso fuera de rango',
        error: 'El peso es un porcentaje entre 0 y 100 (déjalo vacío para repartir en partes iguales).',
      };
    }
    hoja.getColumn(c.indice).width = c.tipo === 'ESTUDIANTE' ? 36 : c.tipo === 'DOCUMENTO' ? 15 : c.tipo === 'DESEMPENO' || c.tipo === 'ESTADO' ? 14 : 13;
  }
  hoja.getCell(FILA_NOMBRES, 2).value = 'Estudiante  (escribe el nombre de cada casilla →)';
  hoja.getCell(FILA_PESOS, 2).value = 'Peso en el bloque (%) — vacío = partes iguales';
  hoja.getCell(FILA_EFECTIVO, 2).value = 'Peso que realmente cuenta (%)';
  for (const fila of [FILA_PESOS, FILA_EFECTIVO]) hoja.getCell(fila, 2).font = { italic: true, color: { argb: 'FF788794' } };
  hoja.getRow(FILA_NOMBRES).height = 42;

  // --- Peso efectivo de cada casilla: lo puesto, o el resto repartido en partes iguales entre las que no tienen peso ---
  for (const b of bloques) {
    const nombres = `${letra(b.primera)}$${FILA_NOMBRES}:${letra(b.ultima)}$${FILA_NOMBRES}`;
    const pesos = `${letra(b.primera)}$${FILA_PESOS}:${letra(b.ultima)}$${FILA_PESOS}`;
    for (let col = b.primera; col <= b.ultima; col += 1) {
      const origen = columnas[col - 1] as Columna;
      const propio = `${letra(col)}$${FILA_NOMBRES}`;
      const pesoPropio = `${letra(col)}$${FILA_PESOS}`;
      const sinPeso = `SUMPRODUCT(--(${nombres}<>""),--NOT(ISNUMBER(${pesos})))`;
      const puesto = `SUMPRODUCT(--(${nombres}<>""),${pesos})`;
      const celda = hoja.getCell(FILA_EFECTIVO, col);
      celda.value = {
        formula: `IF(${propio}="",0,IF(ISNUMBER(${pesoPropio}),${pesoPropio},IF(${sinPeso}=0,0,MAX(0,100-${puesto})/${sinPeso})))`,
        result: origen.pesoEfectivo ?? 0,
      };
      celda.numFmt = '0.##';
      celda.alignment = { horizontal: 'center' };
      celda.font = { italic: true, color: { argb: 'FF788794' } };
    }
  }

  // --- Estudiantes ---
  planilla.estudiantes.forEach((fila, i) => {
    const r = FILA_INICIAL + i;
    const cerrada = fila.estado === 'CERRADO' || fila.estado === 'DEFINITIVO';
    for (const c of columnas) {
      const celda = hoja.getCell(r, c.indice);
      switch (c.tipo) {
        case 'DOCUMENTO':
          // Texto, no número: un documento con ceros a la izquierda no debe perderlos.
          celda.value = fila.estudiante.numero_documento;
          celda.numFmt = '@';
          break;
        case 'ESTUDIANTE':
          celda.value = `${fila.estudiante.apellido} ${fila.estudiante.nombre}`;
          break;
        case 'CASILLA':
        case 'NUEVA': {
          celda.value = c.tipo === 'CASILLA' ? (fila.notas[c.clave] ?? null) : null;
          celda.numFmt = '0.0#';
          celda.alignment = { horizontal: 'center' };
          celda.protection = { locked: cerrada || !editable };
          celda.dataValidation = {
            type: 'decimal',
            operator: 'between',
            allowBlank: true,
            formulae: [planilla.escala.nota_minima, planilla.escala.nota_maxima],
            showErrorMessage: true,
            errorTitle: 'Nota fuera de la escala',
            error: `La nota debe estar entre ${planilla.escala.nota_minima} y ${planilla.escala.nota_maxima}.`,
          };
          break;
        }
        case 'BLOQUE': {
          const b = bloques.find((x) => x.clave === c.clave) as (typeof bloques)[number];
          const rango = `${letra(b.primera)}${r}:${letra(b.ultima)}${r}`;
          const efectivos = `${letra(b.primera)}$${FILA_EFECTIVO}:${letra(b.ultima)}$${FILA_EFECTIVO}`;
          celda.value = {
            formula: `IF(COUNT(${rango})=0,"",IF(SUMPRODUCT(--ISNUMBER(${rango}),${efectivos})=0,ROUND(AVERAGE(${rango}),2),ROUND(SUMPRODUCT(${rango},${efectivos})/SUMPRODUCT(--ISNUMBER(${rango}),${efectivos}),2)))`,
            result: fila.bloques[c.clave] ?? '',
          };
          celda.numFmt = '0.00';
          celda.alignment = { horizontal: 'center' };
          celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          break;
        }
        case 'NOTA': {
          const terminos = bloques.map((b) => ({ ref: `${letra(b.columnaBloque)}${r}`, pct: b.porcentaje }));
          const numerador = terminos.map((t) => `IF(ISNUMBER(${t.ref}),${t.ref}*${t.pct},0)`).join('+');
          const denominador = terminos.map((t) => `IF(ISNUMBER(${t.ref}),${t.pct},0)`).join('+');
          celda.value = { formula: `IF((${denominador})=0,"",ROUND((${numerador})/(${denominador}),2))`, result: fila.nota_asignatura ?? '' };
          celda.numFmt = '0.00';
          celda.font = { bold: true };
          celda.alignment = { horizontal: 'center' };
          break;
        }
        case 'DESEMPENO': {
          // El nivel se resuelve con la nota redondeada a la precisión de la escala, igual que en el servidor.
          const bruta = `${letra(colNota)}${r}`;
          const nota = `ROUND(${bruta},${planilla.escala.precision_decimales})`;
          const cadena = rangos.reduceRight((resto, rango, idx) => (idx === rangos.length - 1 ? `"${comillas(rango.etiqueta)}"` : `IF(${nota}>=${rango.valor_minimo},"${comillas(rango.etiqueta)}",${resto})`), '""');
          celda.value = { formula: `IF(${bruta}="","",${cadena})`, result: fila.desempeno?.etiqueta ?? '' };
          celda.alignment = { horizontal: 'center' };
          break;
        }
        case 'ESTADO':
          celda.value = fila.estado;
          celda.alignment = { horizontal: 'center' };
          break;
      }
    }
  });

  // --- Plantilla del colegio: lo que no quiere ver se OCULTA (no se quita): la importación y las fórmulas siguen contando con esas columnas ---
  const ocultar = (tipo: TipoColumna, oculta: boolean) => {
    if (oculta) for (const c of columnas.filter((x) => x.tipo === tipo)) hoja.getColumn(c.indice).hidden = true;
  };
  ocultar('DOCUMENTO', !plantilla.columnas.documento);
  ocultar('BLOQUE', !plantilla.columnas.promedios_componente);
  ocultar('DESEMPENO', !plantilla.columnas.desempeno);
  ocultar('ESTADO', !plantilla.columnas.estado);
  // La fila de pesos puestos es de entrada y no se oculta; la que se puede esconder es la calculada.
  if (!plantilla.columnas.pesos) hoja.getRow(FILA_EFECTIVO).hidden = true;

  // Firmas y pie al final de la hoja (bloqueados, como todo lo que no es una nota).
  const filaFinal = FILA_INICIAL + planilla.estudiantes.length + 2;
  plantilla.firmas.forEach((firma, i) => {
    const columna = 2 + i * 3;
    hoja.getCell(filaFinal + 2, columna).value = '______________________________';
    const nombre = firma.usa_docente ? (contexto?.docente ? `${contexto.docente.nombre} ${contexto.docente.apellido}` : '') : firma.nombre;
    hoja.getCell(filaFinal + 3, columna).value = nombre;
    hoja.getCell(filaFinal + 3, columna).font = { bold: true };
    hoja.getCell(filaFinal + 4, columna).value = firma.cargo;
  });
  if (plantilla.pie) {
    hoja.getCell(filaFinal, 2).value = plantilla.pie;
    hoja.getCell(filaFinal, 2).font = { italic: true, color: { argb: 'FF788794' } };
  }

  // --- Hoja de datos oculta: a qué clase pertenece y qué es cada columna ---
  const datos = libro.addWorksheet(HOJA_DATOS, { state: 'hidden' });
  datos.getCell('A1').value = 'teacher_assignment_id';
  datos.getCell('B1').value = asignacionId;
  datos.getCell('A2').value = 'periodo_numero';
  datos.getCell('B2').value = periodoNumero;
  columnas.forEach((c) => {
    datos.getCell(FILA_LLAVES, c.indice).value = `${c.tipo}:${c.clave}`;
  });

  // Instantánea de lo que se descargó: al subir solo cuenta lo que el docente cambió respecto a esto, y si alguien cambió lo mismo
  // en el sistema entretanto (una actividad calificada en línea, un peso nuevo) se avisa en vez de pisarlo en silencio.
  datos.getCell('A3').value = 'descargado_en';
  datos.getCell('B3').value = new Date().toISOString();
  datos.getCell('A4').value = 'instantanea';
  datos.getCell('B4').value = VERSION_INSTANTANEA;
  for (const c of columnas.filter((x) => x.tipo === 'CASILLA' || x.tipo === 'NUEVA')) {
    datos.getCell(FILA_NOMBRES, c.indice).value = c.encabezado || null;
    datos.getCell(FILA_PESOS, c.indice).value = c.peso ?? null;
  }
  planilla.estudiantes.forEach((fila, i) => {
    const r = FILA_INICIAL + i;
    datos.getCell(r, 1).value = fila.estudiante.numero_documento;
    datos.getCell(r, 1).numFmt = '@';
    for (const c of columnas.filter((x) => x.tipo === 'CASILLA')) datos.getCell(r, c.indice).value = fila.notas[c.clave] ?? null;
  });

  await hoja.protect(CLAVE_PROTECCION, { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, formatRows: false });

  const nombreArchivo = `notas-${contexto?.asignatura?.nombre ?? 'clase'}-${contexto?.grupo?.nomenclatura ?? ''}-periodo-${periodoNumero}.xlsx`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '-');
  return { buffer: Buffer.from(await libro.xlsx.writeBuffer()), nombreArchivo };
}

/** Texto de una celda, venga como texto, número, texto enriquecido o resultado de fórmula. */
function textoDeCelda(celda: ExcelJS.Cell): string {
  const valor = celda.value;
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'object') {
    if ('richText' in valor) return valor.richText.map((t) => t.text).join('').trim();
    if ('result' in valor) return String(valor.result ?? '').trim();
    if ('text' in valor) return String(valor.text ?? '').trim();
    return '';
  }
  return String(valor).trim();
}

/** Número de una celda: Excel en español guarda la coma decimal como texto cuando la celda no es numérica. null = vacía, NaN = no es número. */
function numeroDeCelda(celda: ExcelJS.Cell): number | null {
  const texto = textoDeCelda(celda);
  if (texto === '') return null;
  return typeof celda.value === 'number' ? celda.value : Number(texto.replace(',', '.'));
}

export interface ResultadoImportacionNotas {
  asignatura: string;
  grupo: string;
  periodo: number;
  guardadas: number;
  sin_cambios: number;
  casillas_creadas: number;
  casillas_renombradas: number;
  pesos_actualizados: number;
}

const igualesPeso = (a: number | null, b: number | null): boolean => (a === null || b === null ? a === b : Math.abs(a - b) < 0.005);
const igualesNota = (a: number | null, b: number | null): boolean => (a === null || b === null ? a === b : Math.abs(a - b) < 0.0001);

interface ColumnaImportada {
  indice: number;
  tipo: 'CASILLA' | 'NUEVA';
  /** Id de la casilla existente, o clave del bloque si es nueva. */
  clave: string;
  nombre: string;
  peso: number | null;
  /** Lo que el docente tocó respecto a lo que descargó: lo demás se deja como esté en el sistema. */
  nombreCambiado: boolean;
  pesoCambiado: boolean;
}

/**
 * Aplica una planilla diligenciada sin conexión. Se valida TODA antes de escribir: un documento que no es del grupo, una nota
 * no numérica o fuera de la escala, una casilla que ya no existe, un bloque que se pasa de sus casillas máximas o pesos que
 * suman más de 100% es error y no se guarda nada. Solo cuentan las celdas de nota, los nombres y los pesos (las columnas
 * calculadas se ignoran). Crear casillas, ponerles peso y guardar notas pasa por los mismos servicios de la planilla en línea,
 * o sea las mismas reglas (clase del docente, periodo que admita notas, escala del año, planilla no cerrada).
 *
 * Mientras el docente trabajaba sin conexión el sistema pudo cambiar (calificó una actividad en línea, ajustó un peso). Por eso
 * el archivo trae una instantánea de lo que se descargó y solo se aplica lo que el docente cambió respecto a ella: una celda que
 * no tocó nunca pisa lo nuevo del sistema, y si tocó una que alguien más cambió entretanto es un conflicto que se reporta (no se
 * guarda nada) para que descargue de nuevo y decida.
 */
export async function importarPlantillaNotas(archivo: Buffer, docente: UserDocument, ip?: string | null): Promise<ResultadoImportacionNotas> {
  if (archivo.length > MAX_BYTES_EXCEL_NOTAS) throw new ApiError(400, 'El archivo supera los 2 MB.');
  if (!archivo.subarray(0, 4).equals(FIRMA_ZIP)) throw new ApiError(400, 'El archivo no es un Excel (.xlsx) válido.');

  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(archivo as unknown as ArrayBuffer);
  } catch {
    throw new ApiError(400, 'No se pudo leer el archivo: no es un Excel (.xlsx) válido.');
  }

  const hoja = libro.getWorksheet(HOJA_PLANILLA);
  const datos = libro.getWorksheet(HOJA_DATOS);
  const asignacionId = datos ? textoDeCelda(datos.getCell('B1')) : '';
  const periodoNumero = datos ? Number(textoDeCelda(datos.getCell('B2'))) : NaN;
  if (asignacionId === ASIGNACION_DE_MUESTRA) {
    throw new ApiError(400, 'Este archivo es una muestra del formato de la planilla, no la de una clase. El docente descarga la suya desde «Planilla de notas».');
  }
  if (!hoja || !datos || !Types.ObjectId.isValid(asignacionId) || !Number.isInteger(periodoNumero)) {
    throw new ApiError(400, 'El archivo no es una planilla de notas de Klassy. Descárgala desde «Notas» y vuelve a subirla.');
  }
  if (textoDeCelda(datos.getCell('B4')) !== VERSION_INSTANTANEA) {
    throw new ApiError(400, 'Este archivo se descargó con una versión anterior de Klassy y no se puede comparar con lo que hay hoy en el sistema. Descarga la planilla de nuevo.');
  }

  const planilla = await obtenerPlanilla(asignacionId, periodoNumero, docente);
  if (!planilla.edicion.puede_editar) throw new ApiError(409, planilla.edicion.motivo ?? 'Esta planilla no admite cambios.');
  const nombreAsignatura = planilla.asignacion?.asignatura?.nombre ?? '';
  const nombreGrupo = planilla.asignacion?.grupo?.nomenclatura ?? '';

  const llaves = new Map<number, { tipo: string; clave: string }>();
  datos.getRow(FILA_LLAVES).eachCell((celda, indice) => {
    const [tipo = '', ...resto] = textoDeCelda(celda).split(':');
    llaves.set(indice, { tipo, clave: resto.join(':') });
  });
  const estudiantePorDocumento = new Map(planilla.estudiantes.map((f) => [f.estudiante.numero_documento, f]));
  const existentes = new Map(planilla.bloques.flatMap((b) => b.casillas.map((c) => [c.id, { ...c, bloque: b.clave }] as const)));
  const bloquesPorClave = new Map(planilla.bloques.map((b) => [b.clave, b]));
  const columnaDocumento = [...llaves.entries()].find(([, v]) => v.tipo === 'DOCUMENTO')?.[0] ?? 1;

  // Lo que había al descargar. La nota se busca por documento (no por posición) por si las filas se reordenaron.
  const filaBasePorDocumento = new Map<string, number>();
  datos.eachRow({ includeEmpty: false }, (row, numeroFila) => {
    const documento = numeroFila >= FILA_INICIAL ? textoDeCelda(row.getCell(1)) : '';
    if (documento) filaBasePorDocumento.set(documento, numeroFila);
  });
  const nombreBase = (indice: number): string => textoDeCelda(datos.getCell(FILA_NOMBRES, indice));
  const pesoBase = (indice: number): number | null => numeroDeCelda(datos.getCell(FILA_PESOS, indice));
  const notaBase = (documento: string, indice: number): number | null => {
    const fila = filaBasePorDocumento.get(documento);
    return fila === undefined ? null : numeroDeCelda(datos.getCell(fila, indice));
  };

  const errores: Array<{ fila: number; documento?: string; motivo: string }> = [];

  // --- Encabezados: nombre y peso de cada casilla ---
  const importadas: ColumnaImportada[] = [];
  for (const [indice, llave] of llaves) {
    if (llave.tipo !== 'CASILLA' && llave.tipo !== 'NUEVA') continue;
    const nombre = textoDeCelda(hoja.getCell(FILA_NOMBRES, indice));
    const peso = numeroDeCelda(hoja.getCell(FILA_PESOS, indice));
    if (peso !== null && (!Number.isFinite(peso) || peso < 0 || peso > 100)) {
      errores.push({ fila: FILA_PESOS, motivo: `El peso de «${nombre || `columna ${letra(indice)}`}» debe ser un porcentaje entre 0 y 100.` });
      continue;
    }
    const nombreCambiado = nombre !== nombreBase(indice);
    const pesoCambiado = !igualesPeso(peso, pesoBase(indice));
    if (llave.tipo === 'CASILLA') {
      const existente = existentes.get(llave.clave);
      if (!existente) {
        errores.push({ fila: FILA_NOMBRES, motivo: 'Una columna corresponde a una casilla que ya no existe: descarga la planilla de nuevo.' });
        continue;
      }
      if (existente.tipo === 'MANUAL' && nombre === '') {
        errores.push({ fila: FILA_NOMBRES, motivo: `La casilla «${existente.titulo}» quedó sin nombre. Para quitarla elimínala desde la planilla en línea.` });
        continue;
      }
      if (pesoCambiado && !igualesPeso(existente.peso, pesoBase(indice)) && !igualesPeso(existente.peso, peso)) {
        errores.push({
          fila: FILA_PESOS,
          motivo: `El peso de «${existente.titulo}» cambió en el sistema después de que descargaste el archivo (ahora es ${existente.peso ?? 'automático'}). Descarga la planilla de nuevo para no pisar ese cambio.`,
        });
        continue;
      }
      if (existente.tipo === 'MANUAL' && nombreCambiado && existente.titulo !== nombreBase(indice) && existente.titulo !== nombre) {
        errores.push({
          fila: FILA_NOMBRES,
          motivo: `La casilla «${existente.titulo}» cambió de nombre en el sistema después de que descargaste el archivo. Descarga la planilla de nuevo.`,
        });
        continue;
      }
    }
    importadas.push({ indice, tipo: llave.tipo, clave: llave.clave, nombre, peso, nombreCambiado, pesoCambiado });
  }
  const porIndice = new Map(importadas.map((c) => [c.indice, c]));

  // --- Notas ---
  const notas: Array<{ columna: number; estudianteId: string; nota: number }> = [];
  const conNotas = new Set<number>();
  const documentosVistos = new Set<string>();
  let sinCambios = 0;
  const { nota_minima: minimo, nota_maxima: maximo } = planilla.escala;

  hoja.eachRow({ includeEmpty: false }, (row, numeroFila) => {
    if (numeroFila < FILA_INICIAL) return;
    const documento = textoDeCelda(row.getCell(columnaDocumento));
    if (!documento) return;
    const fila = estudiantePorDocumento.get(documento);
    if (!fila) return void errores.push({ fila: numeroFila, documento, motivo: 'El documento no corresponde a un estudiante de este grupo.' });
    if (documentosVistos.has(documento)) return void errores.push({ fila: numeroFila, documento, motivo: 'El documento está repetido.' });
    documentosVistos.add(documento);

    for (const columna of importadas) {
      const celda = row.getCell(columna.indice);
      const texto = textoDeCelda(celda);
      if (texto === '') continue;
      const nota = numeroDeCelda(celda) as number;
      if (!Number.isFinite(nota)) return void errores.push({ fila: numeroFila, documento, motivo: `«${texto}» no es una nota numérica.` });
      if (nota < minimo || nota > maximo) {
        return void errores.push({ fila: numeroFila, documento, motivo: `La nota ${nota} está fuera de la escala (${minimo} a ${maximo}).` });
      }
      conNotas.add(columna.indice);
      if (columna.tipo === 'CASILLA') {
        const actual = fila.notas[columna.clave] ?? null;
        const alDescargar = notaBase(documento, columna.indice);
        // Igual a lo descargado: el docente no la tocó (aunque el sistema ya tenga otra). Igual a lo de hoy: nada que hacer.
        if (igualesNota(nota, alDescargar) || igualesNota(nota, actual)) {
          sinCambios += 1;
          continue;
        }
        if (!igualesNota(actual, alDescargar)) {
          const titulo = existentes.get(columna.clave)?.titulo ?? 'la casilla';
          errores.push({
            fila: numeroFila,
            documento,
            motivo: `La nota de «${titulo}» cambió en el sistema después de que descargaste el archivo (en tu archivo: ${alDescargar ?? 'vacía'}, ahora en el sistema: ${actual}). Descarga la planilla de nuevo para no pisarla.`,
          });
          continue;
        }
      }
      notas.push({ columna: columna.indice, estudianteId: fila.estudiante._id, nota });
    }
  });

  // --- Casillas nuevas: llevan nombre; el bloque debe tener lugar ---
  const nuevas = importadas.filter((c) => c.tipo === 'NUEVA' && (c.nombre !== '' || conNotas.has(c.indice)));
  for (const columna of nuevas) {
    if (columna.nombre === '') errores.push({ fila: FILA_NOMBRES, motivo: `Hay notas en la columna ${letra(columna.indice)} pero la casilla no tiene nombre.` });
  }
  for (const bloque of planilla.bloques) {
    const total = bloque.casillas.length + nuevas.filter((c) => c.clave === bloque.clave).length;
    if (total > bloque.max_casillas) {
      errores.push({ fila: FILA_NOMBRES, motivo: `«${bloque.nombre}» admite hasta ${bloque.max_casillas} casilla(s) y el archivo trae ${total}.` });
    }
  }

  // --- Pesos: lo puesto en cada bloque no pasa de 100% ---
  const resultanteDePesos = [
    ...[...existentes.values()].map((e) => {
      const importada = importadas.find((c) => c.tipo === 'CASILLA' && c.clave === e.id);
      return { id: e.id, bloque: e.bloque, peso: importada?.pesoCambiado ? importada.peso : e.peso };
    }),
    ...nuevas.map((c) => ({ id: `nueva-${c.indice}`, bloque: c.clave, peso: c.peso })),
  ];
  try {
    exigirPesosValidos(resultanteDePesos, (clave) => bloquesPorClave.get(clave)?.nombre ?? clave);
  } catch (err) {
    if (err instanceof ApiError) errores.push({ fila: FILA_PESOS, motivo: err.message });
    else throw err;
  }

  if (errores.length > 0) throw new ApiError(400, `El archivo tiene ${errores.length} fila(s) con errores; no se guardó nada.`, errores);

  // --- Escritura: casillas nuevas, nombres, pesos y por último las notas ---
  const idDeNueva = new Map<number, string>();
  for (const columna of nuevas) {
    const creada = await crearCasilla(
      { teacher_assignment_id: asignacionId, periodo_numero: periodoNumero, bloque_clave: columna.clave, nombre: columna.nombre },
      docente,
      ip
    );
    idDeNueva.set(columna.indice, String(creada._id));
  }

  let renombradas = 0;
  for (const columna of importadas) {
    if (columna.tipo !== 'CASILLA') continue;
    const existente = existentes.get(columna.clave);
    if (existente?.tipo === 'MANUAL' && columna.nombreCambiado && columna.nombre !== existente.titulo) {
      await actualizarCasilla(columna.clave, { nombre: columna.nombre }, docente, ip);
      renombradas += 1;
    }
  }

  const pesos: Array<{ casilla_id: string; peso: number | null }> = [];
  for (const columna of importadas) {
    if (columna.tipo === 'CASILLA') {
      const existente = existentes.get(columna.clave);
      if (existente && columna.pesoCambiado && !igualesPeso(existente.peso, columna.peso)) pesos.push({ casilla_id: columna.clave, peso: columna.peso });
    } else if (columna.peso !== null && idDeNueva.has(columna.indice)) {
      pesos.push({ casilla_id: idDeNueva.get(columna.indice) as string, peso: columna.peso });
    }
  }
  if (pesos.length > 0) await establecerPesos({ teacher_assignment_id: asignacionId, periodo_numero: periodoNumero, pesos }, docente, ip);

  const celdas: CeldaPlanilla[] = notas.map((n) => {
    const columna = porIndice.get(n.columna) as ColumnaImportada;
    return { student_id: n.estudianteId, casilla_id: columna.tipo === 'CASILLA' ? columna.clave : (idDeNueva.get(columna.indice) as string), nota: n.nota };
  });
  const guardado = celdas.length > 0 ? await guardarCeldas({ teacher_assignment_id: asignacionId, periodo_numero: periodoNumero, celdas }, docente, ip) : { guardadas: 0, sin_cambios: 0 };

  return {
    asignatura: nombreAsignatura,
    grupo: nombreGrupo,
    periodo: periodoNumero,
    guardadas: guardado.guardadas,
    sin_cambios: sinCambios + guardado.sin_cambios,
    casillas_creadas: nuevas.length,
    casillas_renombradas: renombradas,
    pesos_actualizados: pesos.length,
  };
}
