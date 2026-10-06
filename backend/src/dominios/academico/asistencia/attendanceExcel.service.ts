import ExcelJS from 'exceljs';
import { UserDocument } from '../../../models/user.model';
import ApiError from '../../../utils/ApiError';
import { ConsultaPlanilla, obtenerPlanilla, registrarAsistencia } from './attendance.service';

const HOJA_ASISTENCIA = 'Asistencia';
// La hoja de datos viaja con el archivo: dice a qué planilla pertenece (para no depender de lo que el docente
// recuerde) y alimenta la lista desplegable de estados.
const HOJA_DATOS = 'Datos';
const FILA_INICIAL = 2;
const COLUMNA = { documento: 1, estudiante: 2, estado: 3, novedad: 4 } as const;

export const MAX_BYTES_EXCEL = 2 * 1024 * 1024;

const FIRMA_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/** Genera la planilla del día en Excel (también abre en Google Sheets), con el estado actual y la lista de estados válida. */
export async function generarPlantillaExcel(
  consulta: ConsultaPlanilla,
  docente: UserDocument
): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const planilla = await obtenerPlanilla(consulta, docente);
  if (planilla.bloqueo) throw new ApiError(409, planilla.bloqueo);

  const activos = planilla.estados.filter((e) => e.estado === 'activo');
  const predeterminado = activos.find((e) => e.es_predeterminado);
  const nombreDe = new Map(planilla.estados.map((e) => [String(e._id), e.nombre]));

  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(HOJA_ASISTENCIA, { views: [{ state: 'frozen', ySplit: 1 }] });
  hoja.columns = [
    { header: 'Documento', width: 16 },
    { header: 'Estudiante', width: 38 },
    { header: 'Estado', width: 16 },
    { header: 'Novedad', width: 50 },
  ];
  hoja.getRow(1).font = { bold: true };

  planilla.estudiantes.forEach((fila, i) => {
    const registro = hoja.getRow(FILA_INICIAL + i);
    // Texto, no número: un documento con ceros a la izquierda no debe perderlos.
    registro.getCell(COLUMNA.documento).value = fila.numero_documento;
    registro.getCell(COLUMNA.documento).numFmt = '@';
    registro.getCell(COLUMNA.estudiante).value = `${fila.apellido} ${fila.nombre}`;
    registro.getCell(COLUMNA.estado).value =
      (fila.state_id ? nombreDe.get(fila.state_id) : predeterminado?.nombre) ?? '';
    registro.getCell(COLUMNA.novedad).value = fila.novedad;
  });

  const datos = libro.addWorksheet(HOJA_DATOS, { state: 'hidden' });
  datos.getCell('A1').value = 'group_id';
  datos.getCell('B1').value = planilla.grupo._id;
  datos.getCell('A2').value = 'subject_id';
  datos.getCell('B2').value = planilla.asignatura._id;
  datos.getCell('A3').value = 'fecha';
  datos.getCell('B3').value = planilla.fecha;
  activos.forEach((e, i) => {
    datos.getCell(i + 1, 4).value = e.nombre;
  });

  const ultimaFila = FILA_INICIAL + planilla.estudiantes.length - 1;
  for (let fila = FILA_INICIAL; fila <= ultimaFila; fila += 1) {
    hoja.getCell(fila, COLUMNA.estado).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: [`${HOJA_DATOS}!$D$1:$D$${activos.length}`],
      showErrorMessage: true,
      errorTitle: 'Estado no válido',
      error: 'Elige un estado de la lista.',
    };
  }

  const nombreArchivo = `asistencia-${planilla.asignatura.nombre}-${planilla.grupo.nomenclatura}-${planilla.fecha}.xlsx`
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

export interface ResultadoImportacionAsistencia {
  grupo: string;
  asignatura: string;
  fecha: string;
  registros: number;
  fallas: number;
}

/**
 * Aplica una planilla diligenciada sin conexión. Se valida toda antes de guardar: un documento que no es del grupo, un
 * estado desconocido o una fila repetida es error de fila y no se guarda nada (igual que las cargas CSV). Guardar pasa
 * por `registrarAsistencia`, así que rigen las mismas reglas de la planilla en línea (clase asignada, fecha válida...).
 */
export async function importarPlantillaExcel(
  archivo: Buffer,
  docente: UserDocument,
  ip?: string | null
): Promise<ResultadoImportacionAsistencia> {
  if (archivo.length > MAX_BYTES_EXCEL) throw new ApiError(400, 'El archivo supera los 2 MB.');
  if (!archivo.subarray(0, 4).equals(FIRMA_ZIP)) throw new ApiError(400, 'El archivo no es un Excel (.xlsx) válido.');

  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(archivo as unknown as ArrayBuffer);
  } catch {
    throw new ApiError(400, 'No se pudo leer el archivo: no es un Excel (.xlsx) válido.');
  }

  const hoja = libro.getWorksheet(HOJA_ASISTENCIA);
  const datos = libro.getWorksheet(HOJA_DATOS);
  const meta = (fila: number) => (datos ? textoDeCelda(datos.getCell(fila, 2)) : '');
  const [groupId, subjectId, fecha] = [meta(1), meta(2), meta(3)];
  const ID = /^[0-9a-f]{24}$/i;
  if (!hoja || !ID.test(groupId) || !ID.test(subjectId) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new ApiError(400, 'El archivo no es una planilla de Klassy. Descárgala desde "Asistencia" y vuelve a subirla.');
  }

  const planilla = await obtenerPlanilla({ group_id: groupId, subject_id: subjectId, fecha }, docente);
  const estudiantePorDocumento = new Map(planilla.estudiantes.map((e) => [e.numero_documento, e]));
  const estadoPorNombre = new Map<string, string>();
  for (const e of planilla.estados.filter((x) => x.estado === 'activo')) {
    estadoPorNombre.set(e.nombre.toLowerCase(), String(e._id));
    estadoPorNombre.set(e.abreviatura.toLowerCase(), String(e._id));
  }

  const errores: Array<{ fila: number; documento?: string; motivo: string }> = [];
  const registros: Array<{ student_id: string; state_id: string; novedad: string }> = [];
  const vistos = new Set<string>();

  hoja.eachRow({ includeEmpty: false }, (row, numeroFila) => {
    if (numeroFila < FILA_INICIAL) return;
    const documento = textoDeCelda(row.getCell(COLUMNA.documento));
    const estado = textoDeCelda(row.getCell(COLUMNA.estado));
    const novedad = textoDeCelda(row.getCell(COLUMNA.novedad));
    if (!documento && !estado && !novedad) return;

    const estudiante = estudiantePorDocumento.get(documento);
    if (!estudiante) return void errores.push({ fila: numeroFila, documento, motivo: 'El documento no corresponde a un estudiante de este grupo.' });
    if (vistos.has(documento)) return void errores.push({ fila: numeroFila, documento, motivo: 'El documento está repetido.' });
    vistos.add(documento);

    const stateId = estadoPorNombre.get(estado.toLowerCase());
    if (!stateId) {
      return void errores.push({ fila: numeroFila, documento, motivo: estado ? `Estado desconocido: "${estado}".` : 'Falta el estado.' });
    }
    if (novedad.length > 500) return void errores.push({ fila: numeroFila, documento, motivo: 'La novedad supera los 500 caracteres.' });
    registros.push({ student_id: estudiante.student_id, state_id: stateId, novedad });
  });

  if (errores.length > 0) {
    throw new ApiError(400, `El archivo tiene ${errores.length} fila(s) con errores; no se guardó nada.`, errores);
  }
  if (registros.length === 0) throw new ApiError(400, 'El archivo no tiene filas de estudiantes.');

  const guardada = await registrarAsistencia({ group_id: groupId, subject_id: subjectId, fecha, registros }, docente, ip);
  const estados = new Map(planilla.estados.map((e) => [String(e._id), e]));
  return {
    grupo: planilla.grupo.nomenclatura,
    asignatura: planilla.asignatura.nombre,
    fecha,
    registros: guardada.registros.length,
    fallas: guardada.registros.filter((r) => estados.get(String(r.state_id))?.cuenta_como_falla).length,
  };
}
