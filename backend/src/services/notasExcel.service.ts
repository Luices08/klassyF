import ExcelJS from 'exceljs';
import { Types } from 'mongoose';
import { MAX_BYTES_EXCEL_NOTAS } from '../constants/notas';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { CeldaPlanilla, guardarCeldas, obtenerPlanilla } from './notas.service';

const HOJA_PLANILLA = 'Planilla';
// La hoja de datos viaja con el archivo: dice a qué clase y periodo pertenece y qué significa cada columna, así subirlo no
// depende de lo que el docente tenga seleccionado en pantalla. Está oculta.
const HOJA_DATOS = 'Datos';
const FILA_ENCABEZADOS = 3;
const FILA_PESOS = 4;
const FILA_INICIAL = 5;
const FILA_LLAVES = 5;
// La protección de la hoja es una comodidad (evita borrar una fórmula sin querer), no la seguridad: al importar, el servidor
// ignora las columnas calculadas y vuelve a validar cada nota contra la base.
const CLAVE_PROTECCION = 'klassy-notas';
const FIRMA_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

type TipoColumna = 'DOCUMENTO' | 'ESTUDIANTE' | 'ACTIVIDAD' | 'DIRECTA' | 'PROMEDIO' | 'NOTA' | 'DESEMPENO' | 'ESTADO';

interface Columna {
  indice: number;
  tipo: TipoColumna;
  /** Id de la actividad, clave del componente o nombre fijo. */
  clave: string;
  encabezado: string;
  /** Peso de la actividad o porcentaje del componente. */
  peso?: number;
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

/** Descarga la planilla de la clase en Excel (también abre en Google Sheets): fórmulas protegidas, solo las notas se editan. */
export async function generarPlantillaNotas(
  asignacionId: string,
  periodoNumero: number,
  docente: UserDocument
): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const planilla = await obtenerPlanilla(asignacionId, periodoNumero, docente);
  if (planilla.componentes.every((c) => c.origen === 'ACTIVIDADES' && c.actividades.length === 0)) {
    throw new ApiError(409, 'Esta clase aún no tiene actividades en el periodo: programa alguna antes de descargar la planilla.');
  }
  const rangos = [...planilla.escala.rangos].sort((x, y) => y.valor_minimo - x.valor_minimo);

  // --- Columnas ---
  const columnas: Columna[] = [
    { indice: 1, tipo: 'DOCUMENTO', clave: 'documento', encabezado: 'Documento' },
    { indice: 2, tipo: 'ESTUDIANTE', clave: 'estudiante', encabezado: 'Estudiante' },
  ];
  const bloques: Array<{ nombre: string; desde: number; hasta: number }> = [];
  const promedioDe = new Map<string, number>();
  const notaDeComponente = new Map<string, number>(); // clave -> columna que trae la nota del componente
  for (const componente of planilla.componentes) {
    const desde = columnas.length + 1;
    if (componente.origen === 'ACTIVIDADES') {
      for (const a of componente.actividades) {
        columnas.push({ indice: columnas.length + 1, tipo: 'ACTIVIDAD', clave: a._id, encabezado: a.titulo, peso: a.peso });
      }
      if (componente.actividades.length > 0) {
        columnas.push({ indice: columnas.length + 1, tipo: 'PROMEDIO', clave: componente.clave, encabezado: `Promedio ${componente.nombre}`, peso: componente.porcentaje });
        promedioDe.set(componente.clave, columnas.length);
        notaDeComponente.set(componente.clave, columnas.length);
      }
    } else {
      columnas.push({ indice: columnas.length + 1, tipo: 'DIRECTA', clave: componente.clave, encabezado: componente.nombre, peso: componente.porcentaje });
      notaDeComponente.set(componente.clave, columnas.length);
    }
    if (columnas.length >= desde) bloques.push({ nombre: `${componente.nombre} (${componente.porcentaje}%)`, desde, hasta: columnas.length });
  }
  const colNota = columnas.length + 1;
  columnas.push({ indice: colNota, tipo: 'NOTA', clave: 'nota', encabezado: 'Nota de la asignatura' });
  columnas.push({ indice: colNota + 1, tipo: 'DESEMPENO', clave: 'desempeno', encabezado: 'Desempeño' });
  columnas.push({ indice: colNota + 2, tipo: 'ESTADO', clave: 'estado', encabezado: 'Estado' });

  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(HOJA_PLANILLA, { views: [{ state: 'frozen', xSplit: 2, ySplit: FILA_PESOS }] });
  const contexto = planilla.asignacion;
  hoja.getCell('A1').value = `${contexto?.asignatura?.nombre ?? 'Asignatura'} · Grupo ${contexto?.grupo?.nomenclatura ?? ''} · Periodo ${planilla.periodo.numero} (${planilla.periodo.nombre})`;
  hoja.getCell('A1').font = { bold: true, size: 13 };

  // --- Encabezados ---
  for (const b of bloques) {
    hoja.mergeCells(2, b.desde, 2, b.hasta);
    const celda = hoja.getCell(2, b.desde);
    celda.value = b.nombre;
    celda.alignment = { horizontal: 'center' };
    celda.font = { bold: true };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF3FF' } };
  }
  for (const c of columnas) {
    const celda = hoja.getCell(FILA_ENCABEZADOS, c.indice);
    celda.value = c.encabezado;
    celda.font = { bold: true };
    celda.alignment = { wrapText: true, vertical: 'middle', horizontal: c.tipo === 'ESTUDIANTE' ? 'left' : 'center' };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.tipo === 'ACTIVIDAD' || c.tipo === 'DIRECTA' ? 'FFFFFFFF' : 'FFF1F5F9' } };
    if (c.peso !== undefined) {
      const peso = hoja.getCell(FILA_PESOS, c.indice);
      peso.value = c.peso;
      peso.alignment = { horizontal: 'center' };
      peso.font = { italic: true, color: { argb: 'FF788794' } };
    }
    hoja.getColumn(c.indice).width = c.tipo === 'ESTUDIANTE' ? 36 : c.tipo === 'DOCUMENTO' ? 15 : c.tipo === 'DESEMPENO' || c.tipo === 'ESTADO' ? 14 : 13;
  }
  hoja.getCell(FILA_PESOS, 2).value = 'Peso de la actividad / % del componente';
  hoja.getCell(FILA_PESOS, 2).font = { italic: true, color: { argb: 'FF788794' } };
  hoja.getRow(FILA_ENCABEZADOS).height = 42;

  // --- Estudiantes ---
  const letraDe = (c: number) => letra(c);
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
        case 'ACTIVIDAD':
        case 'DIRECTA': {
          const nota = c.tipo === 'ACTIVIDAD' ? fila.notas_actividad[c.clave] : fila.notas_directas[c.clave];
          celda.value = nota ?? null;
          celda.numFmt = '0.0#';
          celda.alignment = { horizontal: 'center' };
          celda.protection = { locked: cerrada };
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
        case 'PROMEDIO': {
          const actividades = columnas.filter((x) => x.tipo === 'ACTIVIDAD' && planilla.componentes.find((k) => k.clave === c.clave)?.actividades.some((a) => a._id === x.clave));
          const primera = actividades[0]!.indice;
          const ultima = actividades[actividades.length - 1]!.indice;
          const rango = `${letraDe(primera)}${r}:${letraDe(ultima)}${r}`;
          const pesos = `${letraDe(primera)}$${FILA_PESOS}:${letraDe(ultima)}$${FILA_PESOS}`;
          celda.value = {
            formula: `IF(COUNT(${rango})=0,"",IF(SUMPRODUCT(--ISNUMBER(${rango}),${pesos})=0,ROUND(AVERAGE(${rango}),2),ROUND(SUMPRODUCT(${rango},${pesos})/SUMPRODUCT(--ISNUMBER(${rango}),${pesos}),2)))`,
            result: fila.componentes[c.clave] ?? '',
          };
          celda.numFmt = '0.00';
          celda.alignment = { horizontal: 'center' };
          break;
        }
        case 'NOTA': {
          const terminos = planilla.componentes.flatMap((k) => {
            const col = notaDeComponente.get(k.clave);
            return col ? [{ ref: `${letraDe(col)}${r}`, pct: k.porcentaje }] : [];
          });
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
          const bruta = `${letraDe(colNota)}${r}`;
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

  // --- Hoja de datos oculta: a qué clase pertenece y qué es cada columna ---
  const datos = libro.addWorksheet(HOJA_DATOS, { state: 'hidden' });
  datos.getCell('A1').value = 'teacher_assignment_id';
  datos.getCell('B1').value = asignacionId;
  datos.getCell('A2').value = 'periodo_numero';
  datos.getCell('B2').value = periodoNumero;
  columnas.forEach((c) => {
    datos.getCell(FILA_LLAVES, c.indice).value = `${c.tipo}:${c.clave}`;
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

export interface ResultadoImportacionNotas {
  asignatura: string;
  grupo: string;
  periodo: number;
  guardadas: number;
  sin_cambios: number;
}

/**
 * Aplica una planilla diligenciada sin conexión. Se valida TODA antes de guardar: un documento que no es del grupo, una nota
 * no numérica o una actividad que ya no existe es error de fila y no se guarda nada. Solo cuentan las celdas de nota (las
 * columnas calculadas se ignoran) y solo viajan las que cambiaron; guardar pasa por `guardarCeldas`, o sea las mismas reglas de
 * la planilla en línea (clase del docente, periodo que admita notas, escala del año, planilla no cerrada).
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
  if (!hoja || !datos || !Types.ObjectId.isValid(asignacionId) || !Number.isInteger(periodoNumero)) {
    throw new ApiError(400, 'El archivo no es una planilla de notas de Klassy. Descárgala desde «Notas» y vuelve a subirla.');
  }

  const planilla = await obtenerPlanilla(asignacionId, periodoNumero, docente);
  if (!planilla.edicion.puede_editar) throw new ApiError(409, planilla.edicion.motivo ?? 'Esta planilla no admite cambios.');

  const llaves = new Map<number, { tipo: string; clave: string }>();
  datos.getRow(FILA_LLAVES).eachCell((celda, indice) => {
    const [tipo = '', ...resto] = textoDeCelda(celda).split(':');
    llaves.set(indice, { tipo, clave: resto.join(':') });
  });
  const estudiantePorDocumento = new Map(planilla.estudiantes.map((f) => [f.estudiante.numero_documento, f]));
  const actividadesVigentes = new Set(planilla.componentes.flatMap((c) => c.actividades.map((a) => a._id)));
  const directasVigentes = new Set(planilla.componentes.filter((c) => c.origen === 'NOTA_DIRECTA').map((c) => c.clave));
  const columnaDocumento = [...llaves.entries()].find(([, v]) => v.tipo === 'DOCUMENTO')?.[0] ?? 1;

  const errores: Array<{ fila: number; documento?: string; motivo: string }> = [];
  const celdas: CeldaPlanilla[] = [];
  const documentosVistos = new Set<string>();
  let sinCambios = 0;

  hoja.eachRow({ includeEmpty: false }, (row, numeroFila) => {
    if (numeroFila < FILA_INICIAL) return;
    const documento = textoDeCelda(row.getCell(columnaDocumento));
    if (!documento) return;
    const fila = estudiantePorDocumento.get(documento);
    if (!fila) return void errores.push({ fila: numeroFila, documento, motivo: 'El documento no corresponde a un estudiante de este grupo.' });
    if (documentosVistos.has(documento)) return void errores.push({ fila: numeroFila, documento, motivo: 'El documento está repetido.' });
    documentosVistos.add(documento);

    for (const [indice, llave] of llaves) {
      if (llave.tipo !== 'ACTIVIDAD' && llave.tipo !== 'DIRECTA') continue;
      const texto = textoDeCelda(row.getCell(indice));
      if (texto === '') continue;

      // Excel en español guarda la coma decimal como texto cuando la celda no es numérica.
      const nota = typeof row.getCell(indice).value === 'number' ? (row.getCell(indice).value as number) : Number(texto.replace(',', '.'));
      if (!Number.isFinite(nota)) return void errores.push({ fila: numeroFila, documento, motivo: `«${texto}» no es una nota numérica.` });
      if (llave.tipo === 'ACTIVIDAD' && !actividadesVigentes.has(llave.clave)) {
        return void errores.push({ fila: numeroFila, documento, motivo: 'Una columna corresponde a una actividad que ya no existe: descarga la planilla de nuevo.' });
      }
      if (llave.tipo === 'DIRECTA' && !directasVigentes.has(llave.clave)) {
        return void errores.push({ fila: numeroFila, documento, motivo: 'Una columna corresponde a un componente que ya no se digita como nota directa.' });
      }

      const actual = llave.tipo === 'ACTIVIDAD' ? fila.notas_actividad[llave.clave] : fila.notas_directas[llave.clave];
      if (actual === nota) {
        sinCambios += 1;
        continue;
      }
      celdas.push({
        student_id: fila.estudiante._id,
        nota,
        ...(llave.tipo === 'ACTIVIDAD' ? { actividad_id: llave.clave } : { componente_clave: llave.clave }),
      });
    }
  });

  if (errores.length > 0) throw new ApiError(400, `El archivo tiene ${errores.length} fila(s) con errores; no se guardó nada.`, errores);
  if (celdas.length === 0) {
    return { asignatura: planilla.asignacion?.asignatura?.nombre ?? '', grupo: planilla.asignacion?.grupo?.nomenclatura ?? '', periodo: periodoNumero, guardadas: 0, sin_cambios: sinCambios };
  }

  const guardado = await guardarCeldas({ teacher_assignment_id: asignacionId, periodo_numero: periodoNumero, celdas }, docente, ip);
  return {
    asignatura: planilla.asignacion?.asignatura?.nombre ?? '',
    grupo: planilla.asignacion?.grupo?.nomenclatura ?? '',
    periodo: periodoNumero,
    guardadas: guardado.guardadas,
    sin_cambios: sinCambios + guardado.sin_cambios,
  };
}
