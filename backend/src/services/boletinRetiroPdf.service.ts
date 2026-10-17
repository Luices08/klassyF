import PDFDocument from 'pdfkit';
import { CARGO_RECTORIA_INICIAL, CARGO_SECRETARIA_INICIAL } from '../constants/certificados';
import ConfiguracionCertificados from '../models/configuracionCertificados.model';
import { UserDocument } from '../models/user.model';
import { armarBoletinRetiro, BoletinRetiro, exigirCondicionesDeEntrega, registrarGeneracion } from './boletinRetiro.service';
import { cargarLogo, COLOR, dibujarEncabezado, MARGEN } from './encabezadoInstitucional.service';

type Documento = InstanceType<typeof PDFDocument>;

const NOMBRE_NIVEL_NACIONAL = { SUPERIOR: 'Superior', ALTO: 'Alto', BASICO: 'Básico', BAJO: 'Bajo' } as const;
const limiteInferior = (doc: Documento): number => doc.page.height - 60;
const anchoUtil = (doc: Documento): number => doc.page.width - MARGEN * 2;
const nota = (n: number | null): string => (n === null ? '—' : n.toFixed(2));

function fechaLarga(fecha: Date): string {
  return fecha.toLocaleDateString('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
}

function recortar(doc: Documento, texto: string, ancho: number): string {
  if (doc.widthOfString(texto) <= ancho) return texto;
  let corto = texto;
  while (corto.length > 1 && doc.widthOfString(`${corto}…`) > ancho) corto = corto.slice(0, -1);
  return `${corto}…`;
}

function asegurarEspacio(doc: Documento, alto: number): void {
  if (doc.y + alto > limiteInferior(doc)) doc.addPage();
}

function titulo(doc: Documento, texto: string): void {
  asegurarEspacio(doc, 40);
  doc.moveDown(0.8).font('Helvetica-Bold').fontSize(10).fillColor(COLOR.primario).text(texto.toUpperCase(), MARGEN, doc.y, { width: anchoUtil(doc) });
  doc.moveDown(0.3);
}

/** La nota de una celda: la nota, o la marca de por qué no la hay (E: exenta por traslado; —: sin cerrar). */
function celdaDeNota(n: BoletinRetiro['asignaturas'][number]['notas'][number]): string {
  if (n.estado === 'EXENTA_POR_TRASLADO') return 'E';
  const texto = nota(n.nota);
  return n.estado === 'HOMOLOGADA_EXTERNA' ? `${texto} (H)` : texto;
}

function tablaDeNotas(doc: Documento, b: BoletinRetiro): void {
  const conCorte = b.periodo_corte !== null;
  const columnasPeriodo = b.periodos.length;
  const anchoFijo = 62 + 62 + (conCorte ? 62 : 0);
  const anchoPeriodo = columnasPeriodo > 0 ? Math.min(54, (anchoUtil(doc) - anchoFijo - 150) / columnasPeriodo) : 0;
  const anchoNombre = anchoUtil(doc) - anchoFijo - anchoPeriodo * columnasPeriodo;
  const alto = 17;

  const encabezados = ['Área / Asignatura', ...b.periodos.map((p) => `P${p.numero}`), 'Acumulado', 'Desempeño', ...(conCorte ? [`Corte P${b.periodo_corte?.numero}`] : [])];
  const anchos = [anchoNombre, ...b.periodos.map(() => anchoPeriodo), 62, 62, ...(conCorte ? [62] : [])];
  const dibujarCabecera = (y: number): number => {
    doc.rect(MARGEN, y, anchoUtil(doc), alto + 2).fill(COLOR.suave);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLOR.primario);
    let x = MARGEN;
    encabezados.forEach((texto, i) => {
      doc.text(texto.toUpperCase(), x + 3, y + 6, { width: (anchos[i] ?? 0) - 6, align: i === 0 ? 'left' : 'center', lineBreak: false });
      x += anchos[i] ?? 0;
    });
    return y + alto + 2;
  };

  let y = dibujarCabecera(doc.y);
  let areaActual = '';
  const dibujarFila = (celdas: string[], opciones: { negrita?: boolean; sombreada?: boolean; sangria?: number }) => {
    if (y + alto > limiteInferior(doc)) {
      doc.addPage();
      y = dibujarCabecera(MARGEN);
    }
    if (opciones.sombreada) doc.rect(MARGEN, y, anchoUtil(doc), alto).fill(COLOR.suave);
    doc.font(opciones.negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(COLOR.ink);
    let x = MARGEN;
    celdas.forEach((texto, i) => {
      const ancho = (anchos[i] ?? 0) - 6;
      const sangria = i === 0 ? (opciones.sangria ?? 0) : 0;
      doc.text(recortar(doc, texto, ancho - sangria), x + 3 + sangria, y + (alto - 8) / 2 + 0.5, { width: ancho - sangria, align: i === 0 ? 'left' : 'center', lineBreak: false });
      x += anchos[i] ?? 0;
    });
    doc.moveTo(MARGEN, y + alto).lineTo(MARGEN + anchoUtil(doc), y + alto).lineWidth(0.4).stroke(COLOR.borde);
    y += alto;
  };

  for (const asignatura of b.asignaturas) {
    if (asignatura.area !== areaActual) {
      areaActual = asignatura.area;
      dibujarFila([areaActual, ...b.periodos.map(() => ''), '', '', ...(conCorte ? [''] : [])], { negrita: true, sombreada: true });
    }
    dibujarFila(
      [
        asignatura.nombre,
        ...asignatura.notas.map(celdaDeNota),
        nota(asignatura.acumulado),
        asignatura.desempeno_acumulado ?? '—',
        ...(conCorte ? [asignatura.corte ? `${nota(asignatura.corte.nota)}${asignatura.corte.parcial ? '*' : ''}` : '—'] : []),
      ],
      { sangria: 8 }
    );
  }
  dibujarFila(['Promedio general', ...b.periodos.map((p) => nota(p.promedio)), nota(b.promedio_acumulado), b.desempeno_acumulado ?? '—', ...(conCorte ? [''] : [])], { negrita: true, sombreada: true });
  doc.y = y + 4;
  doc.x = MARGEN;
}

async function firmantes(): Promise<{ rectoria: string; secretaria: string }> {
  const config = await ConfiguracionCertificados.findOne().select('rectoria.cargo secretaria.cargo').lean();
  return { rectoria: config?.rectoria?.cargo || CARGO_RECTORIA_INICIAL, secretaria: config?.secretaria?.cargo || CARGO_SECRETARIA_INICIAL };
}

/** Dibuja el boletín parcial de retiro. Todo sale del `BoletinRetiro` ya calculado: el PDF no consulta notas. */
export async function renderizarBoletinRetiro(b: BoletinRetiro, logo: Buffer | null): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: MARGEN, left: MARGEN, right: MARGEN, bottom: 50 }, bufferPages: true });
  const partes: Buffer[] = [];
  doc.on('data', (parte: Buffer) => partes.push(parte));
  const listo = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });
  const firmas = await firmantes();

  dibujarEncabezado(
    doc,
    { institucion: b.institucion.nombre, codigo_dane: b.institucion.codigo_dane, nit: b.institucion.nit, resolucion_aprobacion: b.institucion.resolucion_aprobacion, sede: b.estudiante.sede, jornada: b.estudiante.jornada, anio: b.academic_year },
    'Boletín parcial de retiro',
    `BPR-${b.academic_year}-${b.enrollment_id.slice(-6).toUpperCase()}`,
    logo
  );

  titulo(doc, 'Estudiante');
  doc.font('Helvetica').fontSize(9).fillColor(COLOR.ink);
  doc.text(`${b.estudiante.nombre_completo}  ·  Documento ${b.estudiante.documento}`);
  doc.text(`Grado ${b.estudiante.grado}  ·  Grupo ${b.estudiante.grupo}`);
  doc.text(`${b.salida.nombre_tipo} con fecha efectiva ${fechaLarga(b.salida.fecha_efectiva)}${b.salida.institucion_receptora ? `, hacia ${b.salida.institucion_receptora}` : ''}.`);

  titulo(doc, 'Valoración acumulada a la fecha de salida');
  if (b.asignaturas.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLOR.tenue).text('Todavía no hay periodos cerrados con notas de este estudiante.');
  } else {
    tablaDeNotas(doc, b);
    doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.tenue);
    const pesos = b.periodos.map((p) => `P${p.numero} ${p.porcentaje}%`).join(', ');
    doc.text(
      `Acumulado: notas definitivas de los periodos cerrados ponderadas por el porcentaje de cada periodo (${pesos}), repartido entre los periodos incluidos. ` +
        '(H): nota homologada de la institución de procedencia. E: exenta por traslado. —: sin nota cerrada.' +
        (b.periodo_corte ? ' *: corte parcial a la fecha de salida; no es definitivo y no entra en el acumulado.' : ''),
      MARGEN,
      doc.y,
      { width: anchoUtil(doc) }
    );
  }

  titulo(doc, 'Asistencia hasta la fecha de salida');
  doc.font('Helvetica').fontSize(9).fillColor(COLOR.ink).text(
    `Fallas justificadas: ${b.asistencia.fallas_justificadas}   ·   Fallas injustificadas: ${b.asistencia.fallas_injustificadas}   ·   Retardos: ${b.asistencia.retardos}`
  );

  titulo(doc, 'Escala de valoración');
  doc.font('Helvetica').fontSize(8).fillColor(COLOR.ink);
  for (const nivel of b.escala) {
    doc.text(`${nivel.etiqueta}: ${nivel.valor_minimo.toFixed(1)} a ${nivel.valor_maximo.toFixed(1)}  (${NOMBRE_NIVEL_NACIONAL[nivel.nivel]} en la escala nacional)`);
  }

  if (b.advertencias.length > 0) {
    titulo(doc, 'Observaciones del documento');
    doc.font('Helvetica').fontSize(8).fillColor(COLOR.cuerpo);
    for (const advertencia of b.advertencias) doc.text(`• ${advertencia}`, MARGEN, doc.y, { width: anchoUtil(doc) });
  }

  asegurarEspacio(doc, 90);
  const yFirmas = Math.max(doc.y + 46, doc.y);
  const mitad = anchoUtil(doc) / 2;
  doc.moveTo(MARGEN + 10, yFirmas).lineTo(MARGEN + mitad - 20, yFirmas).lineWidth(0.5).stroke(COLOR.cuerpo);
  doc.moveTo(MARGEN + mitad + 20, yFirmas).lineTo(MARGEN + anchoUtil(doc) - 10, yFirmas).lineWidth(0.5).stroke(COLOR.cuerpo);
  doc.font('Helvetica').fontSize(8).fillColor(COLOR.cuerpo);
  doc.text(firmas.rectoria, MARGEN + 10, yFirmas + 4, { width: mitad - 30, align: 'center' });
  doc.text(firmas.secretaria, MARGEN + mitad + 20, yFirmas + 4, { width: mitad - 30, align: 'center' });

  const { start, count } = doc.bufferedPageRange();
  const generado = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
  for (let i = 0; i < count; i += 1) {
    doc.switchToPage(start + i);
    doc.font('Helvetica').fontSize(7).fillColor(COLOR.tenue);
    doc.text(`Generado el ${generado} · Página ${i + 1} de ${count}`, MARGEN, doc.page.height - 34, { width: anchoUtil(doc), align: 'right', lineBreak: false });
  }
  doc.end();
  return listo;
}

/** El PDF que se entrega: si el SIEE del colegio lo condiciona al paz y salvo, solo sale con este aprobado. Queda auditado. */
export async function generarPdfBoletinRetiro(enrollmentId: string, usuario: UserDocument, ip?: string | null): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const boletin = await armarBoletinRetiro(enrollmentId, usuario);
  await exigirCondicionesDeEntrega(enrollmentId);
  const buffer = await renderizarBoletinRetiro(boletin, await cargarLogo());
  await registrarGeneracion(enrollmentId, usuario, ip);
  return { buffer, nombreArchivo: `boletin-parcial-retiro-${boletin.estudiante.documento}.pdf` };
}
