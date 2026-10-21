import ExcelJS from 'exceljs';
import { ConteoSexo } from '../utils/c600';
import { neutralizarFormula } from '../utils/importacion';
import type { ReporteC600 } from './c600.service';

const COLOR = { azulSuave: 'FFEAF3FF', texto: 'FF172235', tenue: 'FF788794', borde: 'FFDDE4EC', gris: 'FFF1F5F9' };
const BORDE = { style: 'thin' as const, color: { argb: COLOR.borde } };
const LINEA = '________________';

/**
 * El reporte C-600 en **una sola hoja**: encabezado, balance de matrícula, resultados por grado y sexo, edad por grado y la firma del rector, uno debajo del otro. Los
 * datos son los mismos de la vista previa. El sector y los códigos DIVIPOLA quedan como líneas para escribir (el sistema no los guarda).
 */
export async function generarExcelC600(r: ReporteC600): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Klassy';
  libro.created = r.generado_en;
  const hoja = libro.addWorksheet('C-600');
  const columnasMaximas = 2 + r.grados.length * (r.hay_otro_sin_dato ? 3 : 2);
  hoja.getColumn(1).width = 26;
  for (let c = 2; c <= Math.max(columnasMaximas, 14); c++) hoja.getColumn(c).width = 9;

  let fila = 1;
  const texto = (valor: string, opciones: { negrita?: boolean; tamano?: number; color?: string; cursiva?: boolean; ancho?: number } = {}) => {
    const celda = hoja.getCell(fila, 1);
    celda.value = neutralizarFormula(valor);
    celda.font = { bold: opciones.negrita, italic: opciones.cursiva, size: opciones.tamano ?? 10, color: { argb: opciones.color ?? COLOR.texto } };
    hoja.mergeCells(fila, 1, fila, opciones.ancho ?? Math.max(columnasMaximas, 8));
    fila += 1;
  };

  texto('REPORTE ESTADÍSTICO DE EFICIENCIA INTERNA (DANE C-600)', { negrita: true, tamano: 14 });
  texto(`Nombre del establecimiento: ${r.institucion.nombre}`, { negrita: true });
  texto(`Código DANE del establecimiento: ${r.institucion.codigo_dane}`);
  texto(`Sede: ${r.sede ? `${r.sede.nombre} (código DANE ${r.sede.codigo_dane})` : 'Todas las sedes'}   ·   Jornada: ${r.jornada ?? 'Todas las jornadas'}`);
  texto(`Año lectivo: ${r.anio}   ·   Sector (oficial / no oficial): ${LINEA}`);
  texto(`Código DIVIPOLA del municipio: ${LINEA}   ·   Código DIVIPOLA del departamento: ${LINEA}`);
  texto(`Estado de los datos: ${r.estado_datos}   ·   Edades cumplidas al ${r.fecha_corte_edad}   ·   Inicio del año: ${r.fecha_inicio_anio}`, { cursiva: true, color: COLOR.tenue, tamano: 9 });
  texto(r.leyenda, { cursiva: true, color: COLOR.tenue, tamano: 8 });
  fila += 1;

  const celdaTabla = (f: number, c: number, valor: string | number, o: { negrita?: boolean; fondo?: string; alinear?: 'left' | 'center' | 'right' } = {}) => {
    const celda = hoja.getCell(f, c);
    celda.value = typeof valor === 'string' ? neutralizarFormula(valor) : valor;
    celda.font = { bold: o.negrita, size: 9, color: { argb: COLOR.texto } };
    if (o.fondo) celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fondo } };
    celda.alignment = { horizontal: o.alinear ?? 'center', vertical: 'middle', wrapText: true };
    celda.border = { top: BORDE, bottom: BORDE, left: BORDE, right: BORDE };
  };
  const tituloDeSeccion = (valor: string) => {
    texto(valor, { negrita: true, tamano: 11 });
  };

  // --- Sección 2: balance ---
  tituloDeSeccion('BALANCE GENERAL DE MATRÍCULA Y MOVIMIENTO ANUAL');
  ['Grado', 'Matrícula inicial', 'Ingresados durante el año', 'Retirados / desertores', 'Matrícula final'].forEach((t, i) => celdaTabla(fila, i + 1, t, { negrita: true, fondo: COLOR.azulSuave, alinear: i === 0 ? 'left' : 'center' }));
  hoja.getRow(fila).height = 30;
  fila += 1;
  for (const f of r.balance.filas) {
    [f.grado, f.matricula_inicial, f.ingresados, f.retirados, f.matricula_final].forEach((v, i) => celdaTabla(fila, i + 1, v, { alinear: i === 0 ? 'left' : 'center' }));
    fila += 1;
  }
  const t = r.balance.total;
  ['Total', t.matricula_inicial, t.ingresados, t.retirados, t.matricula_final].forEach((v, i) => celdaTabla(fila, i + 1, v, { negrita: true, fondo: COLOR.gris, alinear: i === 0 ? 'left' : 'center' }));
  fila += 2;

  // --- Sección 3: resultados por grado y sexo ---
  const sexos: Array<'H' | 'M' | 'O'> = r.hay_otro_sin_dato ? ['H', 'M', 'O'] : ['H', 'M'];
  const etiquetaSexo = { H: 'H', M: 'M', O: 'Otro / s. d.' };
  const celdasConteo = (c: ConteoSexo): number[] => [...sexos.map((s) => c[s]), c.total];
  const subencabezado = [...sexos.map((s) => etiquetaSexo[s]), 'Total'];
  const bloque = subencabezado.length;

  tituloDeSeccion('RESULTADOS ACADÉMICOS Y EFICIENCIA INTERNA POR GRADO Y SEXO');
  celdaTabla(fila, 1, 'Grado', { negrita: true, fondo: COLOR.azulSuave, alinear: 'left' });
  hoja.mergeCells(fila, 1, fila + 1, 1);
  [['Promovidos / aprobados', 0], ['No promovidos / reprobados', 1], ['Desertores / retirados', 2]].forEach(([titulo, i]) => {
    const desde = 2 + (i as number) * bloque;
    celdaTabla(fila, desde, titulo as string, { negrita: true, fondo: COLOR.azulSuave });
    hoja.mergeCells(fila, desde, fila, desde + bloque - 1);
  });
  const colSinResultado = 2 + 3 * bloque;
  celdaTabla(fila, colSinResultado, 'Sin resultado final', { negrita: true, fondo: COLOR.azulSuave });
  hoja.mergeCells(fila, colSinResultado, fila + 1, colSinResultado);
  fila += 1;
  for (let g = 0; g < 3; g++) subencabezado.forEach((s, i) => celdaTabla(fila, 2 + g * bloque + i, s, { negrita: true, fondo: COLOR.azulSuave }));
  fila += 1;
  for (const f of r.resultados.filas) {
    celdaTabla(fila, 1, f.grado, { alinear: 'left' });
    [...celdasConteo(f.promovidos), ...celdasConteo(f.no_promovidos), ...celdasConteo(f.desertores), f.sin_resultado].forEach((v, i) => celdaTabla(fila, 2 + i, v));
    fila += 1;
  }
  const rt = r.resultados.total;
  celdaTabla(fila, 1, 'Total', { negrita: true, fondo: COLOR.gris, alinear: 'left' });
  [...celdasConteo(rt.promovidos), ...celdasConteo(rt.no_promovidos), ...celdasConteo(rt.desertores), rt.sin_resultado].forEach((v, i) => celdaTabla(fila, 2 + i, v, { negrita: true, fondo: COLOR.gris }));
  fila += 2;

  // --- Sección 4: edad por grado y sexo ---
  tituloDeSeccion('DISTRIBUCIÓN POR EDAD Y GRADO (EXTRAEDAD)');
  const porGrado = sexos.length;
  celdaTabla(fila, 1, 'Edad cumplida', { negrita: true, fondo: COLOR.azulSuave, alinear: 'left' });
  hoja.mergeCells(fila, 1, fila + 1, 1);
  r.grados.forEach((g, i) => {
    const desde = 2 + i * porGrado;
    celdaTabla(fila, desde, g.grado, { negrita: true, fondo: COLOR.azulSuave });
    if (porGrado > 1) hoja.mergeCells(fila, desde, fila, desde + porGrado - 1);
  });
  const colTotal = 2 + r.grados.length * porGrado;
  celdaTabla(fila, colTotal, 'Total', { negrita: true, fondo: COLOR.azulSuave });
  hoja.mergeCells(fila, colTotal, fila + 1, colTotal);
  fila += 1;
  r.grados.forEach((_, i) => sexos.forEach((s, j) => celdaTabla(fila, 2 + i * porGrado + j, etiquetaSexo[s], { negrita: true, fondo: COLOR.azulSuave })));
  fila += 1;
  for (const e of r.edades.filas) {
    celdaTabla(fila, 1, e.etiqueta, { alinear: 'left' });
    r.grados.forEach((g, i) => sexos.forEach((s, j) => celdaTabla(fila, 2 + i * porGrado + j, e.celdas[g.grado_id]?.[s] ?? 0)));
    celdaTabla(fila, colTotal, e.total.total, { negrita: true });
    fila += 1;
  }
  celdaTabla(fila, 1, 'Total', { negrita: true, fondo: COLOR.gris, alinear: 'left' });
  r.grados.forEach((g, i) => sexos.forEach((s, j) => celdaTabla(fila, 2 + i * porGrado + j, r.edades.total_por_grado[g.grado_id]?.[s] ?? 0, { negrita: true, fondo: COLOR.gris })));
  celdaTabla(fila, colTotal, Object.values(r.edades.total_por_grado).reduce((s, c) => s + c.total, 0), { negrita: true, fondo: COLOR.gris });
  fila += 1;
  if (r.edades.sin_fecha_nacimiento > 0) texto(`${r.edades.sin_fecha_nacimiento} estudiante(s) sin fecha de nacimiento no entran a esta tabla.`, { cursiva: true, color: COLOR.tenue, tamano: 8 });
  fila += 1;

  // --- Firma ---
  tituloDeSeccion('DECLARACIÓN Y FIRMAS');
  texto(`${r.firma.cargo}: ${r.firma.nombre || LINEA}`);
  texto('Firma: ______________________________');
  texto(`Fecha de expedición: ${r.firma.fecha_expedicion}`);

  hoja.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  const buffer = Buffer.from(await libro.xlsx.writeBuffer());
  return { buffer, nombreArchivo: `${r.nombre_archivo}.xlsx` };
}
