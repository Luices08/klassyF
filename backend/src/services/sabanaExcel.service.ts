import ExcelJS from 'exceljs';
import { neutralizarFormula } from '../utils/importacion';
import { ReporteSabana, SabanaDeGrupo } from './sabanaCalificaciones.service';

// Los mismos tonos de la guía visual, para que el archivo se parezca a la pantalla.
const COLOR = { azulSuave: 'FFEAF3FF', rojoSuave: 'FFFFF0F0', rojo: 'FFEF5350', naranjaSuave: 'FFFFF5E6', gris: 'FFF1F5F9', texto: 'FF172235', borde: 'FFDDE4EC' };

function nombreDeHoja(grupo: SabanaDeGrupo['grupo'], usados: Set<string>): string {
  const limpio = (t: string) => t.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31);
  let nombre = limpio(grupo.etiqueta);
  if (usados.has(nombre.toLowerCase())) nombre = limpio(`${grupo.etiqueta} ${grupo.sede} ${grupo.jornada}`);
  let n = 2;
  const base = nombre;
  while (usados.has(nombre.toLowerCase())) nombre = `${base.slice(0, 28)} ${n++}`;
  usados.add(nombre.toLowerCase());
  return nombre;
}

function escribirHoja(libro: ExcelJS.Workbook, reporte: ReporteSabana, g: SabanaDeGrupo, nombre: string): void {
  const hoja = libro.addWorksheet(nombre, { views: [{ state: 'frozen', xSplit: 4, ySplit: 5 }] });
  const nAsig = g.asignaturas.length;
  const colPromedio = 5 + nAsig;
  const colPuesto = reporte.mostrar_puesto ? colPromedio + 1 : 0;
  const colReprobadas = (colPuesto || colPromedio) + 1;
  const colFallas = colReprobadas + 1;
  const colPromocion = reporte.incluye_promocion ? colFallas + 1 : 0;
  const ultima = colPromocion || colFallas;

  hoja.getCell(1, 1).value = neutralizarFormula(`${reporte.institucion} — Sábana de calificaciones ${reporte.corte} ${reporte.anio}`);
  hoja.getCell(1, 1).font = { bold: true, size: 14, color: { argb: COLOR.texto } };
  hoja.getCell(2, 1).value = neutralizarFormula(`Grupo ${g.grupo.etiqueta} · ${g.grupo.sede} · ${g.grupo.jornada}`);
  hoja.getCell(2, 1).font = { bold: true, size: 11, color: { argb: COLOR.texto } };
  hoja.getCell(3, 1).value = neutralizarFormula(`${reporte.leyenda} Generado el ${reporte.generado_en.toLocaleString('es-CO')}.`);
  hoja.getCell(3, 1).font = { italic: true, size: 9, color: { argb: 'FF788794' } };

  const encabezados = ['N.º', 'Documento', 'Apellidos', 'Nombres', ...g.asignaturas.map((a) => a.abreviatura), 'Promedio'];
  if (colPuesto) encabezados.push('Puesto');
  encabezados.push('Reprobadas', 'Fallas');
  if (colPromocion) encabezados.push('Promoción');
  const filaEncabezado = hoja.getRow(5);
  encabezados.forEach((t, i) => {
    const c = filaEncabezado.getCell(i + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: COLOR.texto } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.azulSuave } };
    c.alignment = { horizontal: i < 4 ? 'left' : 'center', vertical: 'middle', wrapText: true };
    c.border = { bottom: { style: 'thin', color: { argb: COLOR.borde } } };
  });
  // El nombre completo de cada asignatura queda como nota en su encabezado: la abreviatura sola no siempre se entiende.
  g.asignaturas.forEach((a, i) => {
    filaEncabezado.getCell(5 + i).note = a.nombre;
  });

  g.filas.forEach((f, i) => {
    const fila = hoja.getRow(6 + i);
    fila.getCell(1).value = i + 1;
    fila.getCell(2).value = f.numero_documento; // texto: conserva ceros a la izquierda
    fila.getCell(3).value = neutralizarFormula(f.apellidos);
    fila.getCell(4).value = neutralizarFormula(f.nombres);
    g.asignaturas.forEach((a, j) => {
      const n = f.notas[a.subject_id];
      const c = fila.getCell(5 + j);
      c.alignment = { horizontal: 'center' };
      if (!n || (n.nota === null && !n.exenta)) return;
      if (n.exenta) {
        c.value = 'EX';
        return;
      }
      c.value = n.nota;
      c.numFmt = '0.0#';
      if ((n.nota as number) < reporte.nota_aprobatoria) {
        c.font = { color: { argb: COLOR.rojo }, bold: true };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.rojoSuave } };
      } else if (n.recuperada) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.naranjaSuave } };
      }
    });
    const promedio = fila.getCell(colPromedio);
    promedio.value = f.promedio;
    promedio.numFmt = '0.00';
    promedio.alignment = { horizontal: 'center' };
    promedio.font = { bold: true };
    if (colPuesto) {
      fila.getCell(colPuesto).value = f.puesto;
      fila.getCell(colPuesto).alignment = { horizontal: 'center' };
    }
    fila.getCell(colReprobadas).value = f.reprobadas;
    fila.getCell(colReprobadas).alignment = { horizontal: 'center' };
    if (f.reprobadas > 0) fila.getCell(colReprobadas).font = { color: { argb: COLOR.rojo }, bold: true };
    fila.getCell(colFallas).value = f.fallas;
    fila.getCell(colFallas).alignment = { horizontal: 'center' };
    if (colPromocion) {
      const c = fila.getCell(colPromocion);
      c.value = f.promocion ? `${f.promocion.texto}${f.promocion.oficial ? '' : ' (proyectado)'}` : '';
      if (f.promocion && !f.promocion.oficial) c.font = { italic: true, color: { argb: 'FF788794' } };
    }
  });

  // Resumen para el docente, bajo cada asignatura.
  const base = 6 + g.filas.length + 1;
  const resumenes: Array<[string, (r: SabanaDeGrupo['resumen'][number]) => number | null, string]> = [
    ['Promedio de la asignatura', (r) => r.promedio, '0.00'],
    ['Aprobaron', (r) => r.aprobaron, '0'],
    ['Reprobaron', (r) => r.reprobaron, '0'],
    ['Sin nota', (r) => r.sin_nota, '0'],
  ];
  resumenes.forEach(([titulo, valor, formato], i) => {
    const fila = hoja.getRow(base + i);
    const etiqueta = fila.getCell(4);
    etiqueta.value = titulo;
    etiqueta.font = { bold: true };
    etiqueta.alignment = { horizontal: 'right' };
    g.resumen.forEach((r, j) => {
      const c = fila.getCell(5 + j);
      c.value = valor(r);
      c.numFmt = formato;
      c.alignment = { horizontal: 'center' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.gris } };
    });
  });

  const notaPie = hoja.getCell(base + resumenes.length + 1, 1);
  notaPie.value = `Rojo: nota por debajo de ${reporte.nota_aprobatoria}. Naranja: nota con recuperación. EX: exenta por traslado. Vacío: aún sin nota cerrada.`;
  notaPie.font = { italic: true, size: 9, color: { argb: 'FF788794' } };

  hoja.getColumn(1).width = 5;
  hoja.getColumn(2).width = 14;
  hoja.getColumn(3).width = 22;
  hoja.getColumn(4).width = 22;
  for (let c = 5; c < 5 + nAsig; c++) hoja.getColumn(c).width = 7;
  for (let c = colPromedio; c <= ultima; c++) hoja.getColumn(c).width = c === colPromocion ? 28 : 11;
  hoja.getRow(5).height = 30;
}

/** Un libro con una pestaña por grupo (una sola si se eligió un grupo). */
export async function generarExcelSabana(reporte: ReporteSabana): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Klassy';
  libro.created = reporte.generado_en;
  const usados = new Set<string>();
  for (const g of reporte.grupos) escribirHoja(libro, reporte, g, nombreDeHoja(g.grupo, usados));

  const alcance = reporte.grupos.length === 1 ? reporte.grupos[0]!.grupo.etiqueta : 'todos-los-grupos';
  const corte = reporte.corte.toLowerCase().replace(/\s+/g, '-');
  const nombreArchivo = `sabana-${reporte.anio}-${corte}-${alcance}.xlsx`.replace(/[^\w.\-áéíóúñ]/gi, '-');
  return { buffer: Buffer.from(await libro.xlsx.writeBuffer()), nombreArchivo };
}
