import ExcelJS from 'exceljs';
import { neutralizarFormula } from '../utils/importacion';
import { ReporteTabular } from '../utils/reporteTabular';

// Los mismos tonos de la guía visual, para que el archivo se parezca a la pantalla.
const COLOR = { azulSuave: 'FFEAF3FF', texto: 'FF172235', tenue: 'FF788794', borde: 'FFDDE4EC' };

/** Un solo libro con una hoja «Listado»: título, alcance, estado de los datos, resumen y la tabla con filtros. Se calcula al descargar. */
export async function generarExcelTabular(reporte: ReporteTabular): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Klassy';
  libro.created = reporte.generado_en;
  const hoja = libro.addWorksheet('Listado');

  hoja.getCell(1, 1).value = neutralizarFormula(`${reporte.institucion} — ${reporte.titulo} ${reporte.anio}`);
  hoja.getCell(1, 1).font = { bold: true, size: 14, color: { argb: COLOR.texto } };
  hoja.getCell(2, 1).value = neutralizarFormula(reporte.alcance);
  hoja.getCell(2, 1).font = { bold: true, size: 11, color: { argb: COLOR.texto } };
  hoja.getCell(3, 1).value = neutralizarFormula(`${reporte.leyenda} Generado el ${reporte.generado_en.toLocaleString('es-CO')}.`);
  hoja.getCell(3, 1).font = { italic: true, size: 9, color: { argb: COLOR.tenue } };

  let fila = 4;
  for (const [etiqueta, valor] of reporte.resumen) {
    hoja.getCell(fila, 1).value = neutralizarFormula(etiqueta);
    hoja.getCell(fila, 1).font = { bold: true, size: 9, color: { argb: COLOR.tenue } };
    hoja.getCell(fila, 2).value = typeof valor === 'string' ? neutralizarFormula(valor) : valor;
    hoja.getCell(fila, 2).font = { bold: true, size: 10, color: { argb: COLOR.texto } };
    hoja.getCell(fila, 2).alignment = { horizontal: 'left' };
    fila += 1;
  }
  const filaEncabezado = fila + 1;

  reporte.columnas.forEach((col, i) => {
    hoja.getColumn(i + 1).width = col.ancho;
    const c = hoja.getRow(filaEncabezado).getCell(i + 1);
    c.value = col.titulo;
    c.font = { bold: true, color: { argb: COLOR.texto } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.azulSuave } };
    c.alignment = { horizontal: col.alinear ?? 'left', vertical: 'middle', wrapText: true };
    c.border = { bottom: { style: 'thin', color: { argb: COLOR.borde } } };
  });

  if (reporte.filas.length === 0) {
    hoja.getCell(filaEncabezado + 1, 1).value = neutralizarFormula(reporte.mensaje_vacio);
    hoja.getCell(filaEncabezado + 1, 1).font = { italic: true, color: { argb: COLOR.tenue } };
  }
  reporte.filas.forEach((datos, r) => {
    const f = hoja.getRow(filaEncabezado + 1 + r);
    reporte.columnas.forEach((col, i) => {
      const valor = datos[col.clave] ?? null;
      const c = f.getCell(i + 1);
      // Los documentos y demás textos se guardan como texto (conservan ceros); lo que empiece por = + - @ no se interpreta como fórmula.
      c.value = typeof valor === 'string' ? neutralizarFormula(valor) : valor;
      c.alignment = { horizontal: col.alinear ?? 'left', vertical: 'top', wrapText: true };
      if (typeof valor === 'number' && !col.texto) c.numFmt = Number.isInteger(valor) ? '0' : '0.0#';
    });
  });

  hoja.views = [{ state: 'frozen', ySplit: filaEncabezado }];
  if (reporte.filas.length > 0) hoja.autoFilter = { from: { row: filaEncabezado, column: 1 }, to: { row: filaEncabezado + reporte.filas.length, column: reporte.columnas.length } };
  const buffer = Buffer.from(await libro.xlsx.writeBuffer());
  return { buffer, nombreArchivo: `${reporte.nombre_archivo}.xlsx` };
}
