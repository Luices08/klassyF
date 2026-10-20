import PDFDocument from 'pdfkit';
import { PlantillaBoletin } from '../constants/boletin';
import { UserDocument } from '../models/user.model';
import { imagenDesdeDataUri } from '../utils/almacenImagenes';
import { leerConfiguracionBoletin } from './boletinConfig.service';
import { cargarLogo, COLOR, MARGEN } from './encabezadoInstitucional.service';
import { AsignaturaInforme, EstudianteInforme, FiltrosInformeFinal, InformeFinal, informeFinalParaFamilia, informeFinalParaPersonal } from './informeFinal.service';
import { ESCALA_TEXTO, FUENTES, dibujarMarcaDeAgua, limpiarNombre, nuevoDocumento } from './reportCardPdf.service';

type Documento = InstanceType<typeof PDFDocument>;

const nota = (n: number | null): string => (n === null ? '—' : n.toFixed(2));

/** El estado del informe, en palabras: lo que la familia o el archivo deben saber antes de confiar en las cifras. */
const AVISO_PRELIMINAR = 'INFORME PRELIMINAR: todavía no tiene el cierre de promoción de todos los estudiantes. No es el documento definitivo.';

interface Estilo {
  doc: Documento;
  p: PlantillaBoletin;
  fuente: { n: string; b: string; i: string };
  u: (n: number) => number;
}

function asegurarEspacio({ doc }: Estilo, alto: number): void {
  if (doc.y + alto > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

function encabezado(e: Estilo, informe: InformeFinal, escudo: Buffer | null): void {
  const { doc, p, fuente, u } = e;
  const inicioY = doc.y;
  const ancho = doc.page.width - MARGEN * 2;
  const lado = p.escudo.tamano;
  const lateral = escudo !== null && p.escudo.posicion !== 'MARCA_DE_AGUA';
  const xTexto = lateral && p.escudo.posicion === 'IZQUIERDA' ? MARGEN + lado + 12 : MARGEN;
  const anchoTexto = lateral ? ancho - lado - 12 : ancho;
  if (lateral) {
    try {
      doc.image(escudo as Buffer, p.escudo.posicion === 'DERECHA' ? doc.page.width - MARGEN - lado : MARGEN, inicioY, { fit: [lado, lado] });
    } catch {
      // Un escudo que pdfkit no lee no debe impedir el informe.
    }
  }
  doc.font(fuente.b).fontSize(u(12)).fillColor(COLOR.ink).text(informe.institucion.nombre, xTexto, inicioY, { width: anchoTexto });
  doc.font(fuente.n).fontSize(u(8.5)).fillColor(COLOR.tenue);
  if (p.mostrar_datos_institucion) {
    const linea = [
      informe.institucion.codigo_dane && `DANE ${informe.institucion.codigo_dane}`,
      informe.institucion.nit && `NIT ${informe.institucion.nit}`,
      informe.institucion.resolucion_aprobacion && `Res. ${informe.institucion.resolucion_aprobacion}`,
    ]
      .filter(Boolean)
      .join(' · ');
    if (linea) doc.text(linea, xTexto, doc.y, { width: anchoTexto });
  }
  if (p.mostrar_sede_jornada) doc.text(`${informe.grupo.sede} · Jornada ${informe.grupo.jornada.toLowerCase()}`, xTexto, doc.y, { width: anchoTexto });
  doc.y = Math.max(doc.y, lateral ? inicioY + lado + 4 : inicioY + u(40));
  doc.x = MARGEN;
  doc.moveDown(0.5);
  doc.font(fuente.b).fontSize(u(15)).fillColor(COLOR.ink).text('Informe final de evaluación', MARGEN, doc.y, { width: ancho });
  doc.font(fuente.n).fontSize(u(10)).fillColor(COLOR.cuerpo).text(`Año lectivo ${informe.anio}`, MARGEN, doc.y, { width: ancho });
  if (p.subtitulo.trim()) doc.font(fuente.i).fontSize(u(9.5)).fillColor(COLOR.tenue).text(p.subtitulo, MARGEN, doc.y, { width: ancho });
}

function datos(e: Estilo, informe: InformeFinal, s: EstudianteInforme): void {
  const { doc, p, fuente, u } = e;
  const ancho = doc.page.width - MARGEN * 2;
  const alto = u(58);
  asegurarEspacio(e, alto + u(16));
  const y = doc.moveDown(0.6).y;
  doc.roundedRect(MARGEN, y, ancho, alto, 4).fillAndStroke(COLOR.suave, COLOR.borde);
  doc.fillColor(COLOR.ink).font(fuente.b).fontSize(u(11)).text(s.nombre_completo, MARGEN + 10, y + u(8), { width: ancho * 0.6 });
  doc.font(fuente.n).fontSize(u(8.5)).fillColor(COLOR.cuerpo);
  const identificacion = [p.estudiante.documento && `Documento ${s.documento}`, p.estudiante.grado && `Grado ${informe.grupo.grado}`, p.estudiante.grupo && `Grupo ${informe.grupo.etiqueta}`].filter(Boolean).join(' · ');
  if (identificacion) doc.text(identificacion, MARGEN + 10, y + u(24), { width: ancho * 0.64 });
  const a = s.asistencia;
  doc.text(`Inasistencias del año: ${a.justificadas} justificadas · ${a.injustificadas} injustificadas · ${a.retardos} retardos`, MARGEN + 10, y + u(38), { width: ancho * 0.66 });

  const xDerecha = MARGEN + ancho * 0.68;
  const anchoDerecha = ancho * 0.32 - 10;
  doc.font(fuente.n).fontSize(u(8)).fillColor(COLOR.tenue).text('PROMEDIO GENERAL DEL AÑO', xDerecha, y + u(8), { width: anchoDerecha, align: 'right' });
  doc.font(fuente.b).fontSize(u(16)).fillColor(COLOR.ink).text(nota(s.promedio_general), xDerecha, y + u(19), { width: anchoDerecha, align: 'right' });
  const resumen = [s.desempeno_general?.etiqueta, informe.mostrar_puesto && s.puesto !== null ? `Puesto ${s.puesto} de ${informe.estudiantes.length}` : null].filter(Boolean).join(' · ');
  if (resumen) doc.font(fuente.n).fontSize(u(8.5)).fillColor(COLOR.cuerpo).text(resumen, xDerecha, y + u(41), { width: anchoDerecha, align: 'right' });
  doc.y = y + alto + 6;
  doc.x = MARGEN;
}

function tabla(e: Estilo, informe: InformeFinal, s: EstudianteInforme): void {
  const { doc, fuente, u } = e;
  const ancho = doc.page.width - MARGEN * 2;
  const n = informe.periodos.length;
  const anchoPeriodo = u(32);
  const anchoNota = u(36);
  const anchoNivel = u(58);
  const anchoFallas = u(28);
  const anchoNombre = ancho - n * anchoPeriodo - anchoNota * 3 - anchoNivel - anchoFallas;
  const columnas = {
    periodo: (i: number) => MARGEN + anchoNombre + i * anchoPeriodo,
    anual: MARGEN + anchoNombre + n * anchoPeriodo,
    recuperacion: MARGEN + anchoNombre + n * anchoPeriodo + anchoNota,
    final: MARGEN + anchoNombre + n * anchoPeriodo + anchoNota * 2,
    nivel: MARGEN + anchoNombre + n * anchoPeriodo + anchoNota * 3,
    fallas: MARGEN + anchoNombre + n * anchoPeriodo + anchoNota * 3 + anchoNivel,
  };

  const cabecera = () => {
    asegurarEspacio(e, u(40));
    const y = doc.y;
    doc.rect(MARGEN, y, ancho, u(18)).fill(COLOR.primario);
    doc.font(fuente.b).fontSize(u(7.5)).fillColor('#FFFFFF');
    doc.text('ÁREA / ASIGNATURA', MARGEN + 6, y + u(6), { width: anchoNombre - 6, lineBreak: false });
    informe.periodos.forEach((p, i) => doc.text(`P${p.numero}`, columnas.periodo(i), y + u(6), { width: anchoPeriodo, align: 'center', lineBreak: false }));
    doc.text('AÑO', columnas.anual, y + u(6), { width: anchoNota, align: 'center', lineBreak: false });
    doc.text('RECUP.', columnas.recuperacion, y + u(6), { width: anchoNota, align: 'center', lineBreak: false });
    doc.text('FINAL', columnas.final, y + u(6), { width: anchoNota, align: 'center', lineBreak: false });
    doc.text('NIVEL', columnas.nivel, y + u(6), { width: anchoNivel, align: 'center', lineBreak: false });
    doc.text('FALLAS', columnas.fallas, y + u(6), { width: anchoFallas, align: 'center', lineBreak: false });
    doc.y = y + u(22);
  };
  cabecera();

  const fila = (a: AsignaturaInforme) => {
    asegurarEspacio(e, u(16));
    const y = doc.y;
    doc.font(fuente.n).fontSize(u(8.5)).fillColor(COLOR.ink).text(a.nombre, MARGEN + 6, y, { width: anchoNombre - 6, lineBreak: false });
    doc.fillColor(COLOR.cuerpo);
    a.periodos.forEach((p, i) => doc.text(p.exenta ? 'E' : nota(p.nota), columnas.periodo(i), y, { width: anchoPeriodo, align: 'center', lineBreak: false }));
    doc.text(a.exenta ? 'E' : nota(a.nota_anual), columnas.anual, y, { width: anchoNota, align: 'center', lineBreak: false });
    doc.text(a.nota_recuperacion === null ? '' : nota(a.nota_recuperacion), columnas.recuperacion, y, { width: anchoNota, align: 'center', lineBreak: false });
    doc.font(fuente.b).fillColor(COLOR.ink).text(a.exenta ? 'E' : nota(a.nota_final), columnas.final, y, { width: anchoNota, align: 'center', lineBreak: false });
    doc.font(fuente.n).fillColor(COLOR.cuerpo).text(a.desempeno?.etiqueta ?? '', columnas.nivel, y, { width: anchoNivel, align: 'center', lineBreak: false });
    doc.text(a.fallas > 0 ? String(a.fallas) : '', columnas.fallas, y, { width: anchoFallas, align: 'center', lineBreak: false });
    doc.y = y + u(13);
    doc.moveTo(MARGEN, doc.y).lineTo(MARGEN + ancho, doc.y).lineWidth(0.3).strokeColor(COLOR.borde).stroke();
    doc.y += u(2);
  };

  for (const area of s.areas) {
    asegurarEspacio(e, u(34));
    const y = doc.y;
    doc.rect(MARGEN, y, ancho, u(15)).fill(COLOR.suave);
    doc.font(fuente.b).fontSize(u(8.5)).fillColor(COLOR.ink).text(area.nombre.toUpperCase(), MARGEN + 6, y + u(4), { width: anchoNombre - 6, lineBreak: false });
    doc.text(nota(area.nota_final), columnas.final, y + u(4), { width: anchoNota, align: 'center', lineBreak: false });
    doc.font(fuente.n).text(area.desempeno?.etiqueta ?? '', columnas.nivel, y + u(4), { width: anchoNivel, align: 'center', lineBreak: false });
    doc.y = y + u(18);
    for (const a of area.asignaturas) fila(a);
  }
  if (s.areas.length === 0) doc.font(fuente.n).fontSize(u(9)).fillColor(COLOR.tenue).text('Este grupo no tiene asignaturas con docente asignado.', MARGEN, doc.y);
  doc.x = MARGEN;
}

function notasAlPie(e: Estilo, informe: InformeFinal, s: EstudianteInforme): void {
  const { doc, fuente, u } = e;
  const ancho = doc.page.width - MARGEN * 2;
  doc.moveDown(0.4);
  const texto = [
    `Nota aprobatoria: ${informe.nota_aprobatoria.toFixed(1)}.`,
    'P1…P4: nota efectiva de cada periodo (con la recuperación del periodo si la hubo). AÑO: nota del año antes de la recuperación final. RECUP.: nota tras la recuperación final, solo si cambió la del año.',
    'E: exenta por traslado (no se cursó). —: aún no hay nota cerrada.',
  ];
  if (!s.completo) texto.push('El estudiante tiene asignaturas sin nota del año: este informe es parcial y no hay promedio definitivo.');
  doc.font(fuente.i).fontSize(u(7.5)).fillColor(COLOR.tenue).text(texto.join(' '), MARGEN, doc.y, { width: ancho });
}

function promocion(e: Estilo, s: EstudianteInforme): void {
  const { doc, fuente, u } = e;
  const ancho = doc.page.width - MARGEN * 2;
  asegurarEspacio(e, u(52));
  doc.moveDown(0.8).font(fuente.b).fontSize(u(9)).fillColor(e.p.color_acento).text('ESTADO FINAL DE PROMOCIÓN', MARGEN, doc.y, { characterSpacing: 0.4 });
  doc.moveDown(0.25);
  const y = doc.y;
  doc.roundedRect(MARGEN, y, ancho, u(30), 4).fillAndStroke(COLOR.suave, COLOR.borde);
  doc.font(fuente.b).fontSize(u(11)).fillColor(COLOR.ink).text(s.promocion.oficial ? s.promocion.texto : `${s.promocion.texto} (proyectado)`, MARGEN + 10, y + u(9), { width: ancho - 20 });
  doc.y = y + u(36);
  if (!s.promocion.oficial) {
    doc.font(fuente.i).fontSize(u(8)).fillColor(COLOR.peligro).text('Proyección con las notas registradas hasta hoy; la decisión oficial la toma el cierre de promoción del colegio.', MARGEN, doc.y, { width: ancho });
  }
}

function firmas(e: Estilo, informe: InformeFinal): void {
  const { doc, p, fuente, u } = e;
  if (p.firmas.length === 0) return;
  asegurarEspacio(e, u(80));
  const ancho = doc.page.width - MARGEN * 2;
  const columna = ancho / p.firmas.length;
  doc.moveDown(1.2);
  const yLinea = doc.y + u(34);
  p.firmas.forEach((firma, i) => {
    const x = MARGEN + i * columna + 12;
    const anchoLinea = columna - 24;
    doc.moveTo(x, yLinea).lineTo(x + anchoLinea, yLinea).lineWidth(0.6).strokeColor(COLOR.tenue).stroke();
    const nombre = firma.usa_director_grupo ? (informe.grupo.director ?? '') : firma.nombre;
    doc.font(fuente.b).fontSize(u(8.5)).fillColor(COLOR.ink).text(firma.cargo, x, yLinea + 4, { width: anchoLinea, align: 'center' });
    if (nombre) doc.font(fuente.n).fontSize(u(8)).fillColor(COLOR.cuerpo).text(nombre, x, doc.y, { width: anchoLinea, align: 'center' });
  });
  doc.y = yLinea + u(34);
  doc.x = MARGEN;
  if (p.pie_texto.trim()) doc.moveDown(0.6).font(fuente.i).fontSize(u(8)).fillColor(COLOR.tenue).text(p.pie_texto, MARGEN, doc.y, { width: ancho, align: 'center' });
}

/** Dibuja el informe final: un estudiante por hoja (sigue si no cabe), con el diseño del boletín del colegio. Pura: no toca la base. */
export async function renderizarInformeFinal(informe: InformeFinal, logo: Buffer | null, p: PlantillaBoletin): Promise<Buffer> {
  const escudo = p.escudo.mostrar ? (imagenDesdeDataUri(p.escudo.url)?.buffer ?? logo) : null;
  const { doc, listo } = nuevoDocumento(p.papel);
  const factor = ESCALA_TEXTO[p.tamano_texto];
  const e: Estilo = { doc, p, fuente: FUENTES[p.fuente], u: (n) => n * factor };
  if (escudo && p.escudo.posicion === 'MARCA_DE_AGUA') doc.on('pageAdded', () => dibujarMarcaDeAgua(doc, escudo, p.escudo.tamano));

  if (informe.estudiantes.length === 0) {
    doc.addPage();
    doc.font(e.fuente.n).fontSize(e.u(11)).fillColor(COLOR.cuerpo).text('Este grupo no tiene estudiantes con matrícula activa.');
  }
  for (const s of informe.estudiantes) {
    doc.addPage();
    encabezado(e, informe, escudo);
    if (informe.estado_datos === 'PRELIMINAR') {
      doc.moveDown(0.4).font(e.fuente.b).fontSize(e.u(8.5)).fillColor(COLOR.peligro).text(AVISO_PRELIMINAR, MARGEN, doc.y, { width: doc.page.width - MARGEN * 2 });
    }
    datos(e, informe, s);
    tabla(e, informe, s);
    notasAlPie(e, informe, s);
    promocion(e, s);
    firmas(e, informe);
    doc.font(e.fuente.n).fontSize(e.u(7)).fillColor(COLOR.tenue).text(`Generado el ${informe.generado_en.toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`, MARGEN, doc.y + 6, { width: doc.page.width - MARGEN * 2, align: 'right' });
  }
  doc.end();
  return listo;
}

async function pdfDe(informe: InformeFinal): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const [configuracion, logo] = await Promise.all([leerConfiguracionBoletin(), cargarLogo()]);
  const buffer = await renderizarInformeFinal(informe, logo, configuracion.plantilla);
  const nombre = informe.estudiantes.length === 1 ? (informe.estudiantes[0] as EstudianteInforme).nombre_completo : informe.grupo.etiqueta;
  return { buffer, nombreArchivo: `informe_final_${limpiarNombre(nombre)}_${informe.anio}.pdf` };
}

/** Administración, coordinación y secretaría: un estudiante o todo el grupo. */
export async function generarPdfInformeFinal(filtros: FiltrosInformeFinal, usuario: UserDocument, ip?: string | null) {
  return pdfDe(await informeFinalParaPersonal(filtros, usuario, ip));
}

/** El estudiante o su acudiente, solo cuando el informe fue publicado. */
export async function generarPdfInformeFinalDeFamilia(params: { academic_year_id: string; student_id: string }, usuario: UserDocument, ip?: string | null) {
  return pdfDe(await informeFinalParaFamilia(params, usuario, ip));
}
