import PDFDocument from 'pdfkit';
import { PlantillaBoletin } from '../constants/boletin';
import { LEYENDA_SIGLAS_VALORACION, NOMBRES_NIVEL_VALORACION, SIGLA_NIVEL_VALORACION } from '../constants/valoracionDescriptiva';
import { UserDocument } from '../models/user.model';
import { imagenDesdeDataUri } from '../utils/almacenImagenes';
import { leerConfiguracionBoletin } from './boletinConfig.service';
import { cargarLogo, COLOR, MARGEN } from './encabezadoInstitucional.service';
import { AreaInforme, AsignaturaInforme, EstudianteInforme, FiltrosInformeFinal, InformeFinal, informeFinalParaFamilia, informeFinalParaPersonal } from './informeFinal.service';
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
  /** Cierra la hoja actual (con su pie) y abre otra con una cabecera corta. Lo fija cada estudiante porque el pie lleva su nombre. */
  continuar: () => void;
}

/** Una columna de la tabla: lo que dice su título y cómo se escribe cada fila (asignatura o área). */
interface Columna {
  titulo: string;
  ancho: number;
  x: number;
  valor: (a: AsignaturaInforme) => string;
  valorArea: (a: AreaInforme) => string;
  negrita?: boolean;
  /** La fila de un área escribe algo en esta columna: el título del área puede ocupar todo lo que hay antes de la primera de ellas. */
  enArea?: boolean;
}

const limiteInferior = ({ doc }: Estilo): number => doc.page.height - doc.page.margins.bottom;

/** Si lo que sigue no cabe en la hoja, pasa a otra (y, si es una tabla, repite su cabecera). */
function asegurarEspacio(e: Estilo, alto: number, alContinuar?: () => void): void {
  if (e.doc.y + alto > limiteInferior(e)) {
    e.continuar();
    alContinuar?.();
  }
}

/**
 * El pie de la hoja. Se dibuja con el margen inferior en cero: si no, el texto cae fuera del área útil y pdfkit abre una hoja nueva solo para él
 * (así salía el «Generado el…» solo en una página en blanco).
 */
function pie({ doc, fuente, u }: Estilo, texto: string): void {
  const margen = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.font(fuente.n).fontSize(u(7)).fillColor(COLOR.tenue).text(texto, MARGEN, doc.page.height - u(32), { width: doc.page.width - MARGEN * 2, align: 'right', lineBreak: false });
  doc.page.margins.bottom = margen;
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

/** La cabecera corta de las hojas que continúan: de quién es el informe, para que ninguna hoja suelta quede sin dueño. */
function cabeceraDeContinuacion(e: Estilo, informe: InformeFinal, s: EstudianteInforme): void {
  const { doc, fuente, u } = e;
  const ancho = doc.page.width - MARGEN * 2;
  doc.font(fuente.b).fontSize(u(9)).fillColor(COLOR.ink).text(s.nombre_completo, MARGEN, doc.y, { width: ancho, continued: true });
  doc.font(fuente.n).fillColor(COLOR.tenue).text(`  ·  ${informe.grupo.etiqueta}  ·  Informe final ${informe.anio} (continuación)`, { width: ancho });
  doc.y += u(8);
  doc.x = MARGEN;
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
  if (s.descriptivo) {
    // Preescolar no tiene promedio ni puesto: se dice de qué evaluación se trata en vez de mostrar un guion.
    doc.font(fuente.n).fontSize(u(8)).fillColor(COLOR.tenue).text('EVALUACIÓN', xDerecha, y + u(8), { width: anchoDerecha, align: 'right' });
    doc.font(fuente.b).fontSize(u(12)).fillColor(COLOR.ink).text('Descriptiva', xDerecha, y + u(20), { width: anchoDerecha, align: 'right' });
    doc.font(fuente.n).fontSize(u(8.5)).fillColor(COLOR.cuerpo).text('Sin notas numéricas', xDerecha, y + u(41), { width: anchoDerecha, align: 'right' });
  } else {
    doc.font(fuente.n).fontSize(u(8)).fillColor(COLOR.tenue).text('PROMEDIO GENERAL DEL AÑO', xDerecha, y + u(8), { width: anchoDerecha, align: 'right' });
    doc.font(fuente.b).fontSize(u(16)).fillColor(COLOR.ink).text(nota(s.promedio_general), xDerecha, y + u(19), { width: anchoDerecha, align: 'right' });
    const resumen = [s.desempeno_general?.etiqueta, informe.mostrar_puesto && s.puesto !== null ? `Puesto ${s.puesto} de ${informe.estudiantes.length}` : null].filter(Boolean).join(' · ');
    if (resumen) doc.font(fuente.n).fontSize(u(8.5)).fillColor(COLOR.cuerpo).text(resumen, xDerecha, y + u(41), { width: anchoDerecha, align: 'right' });
  }
  doc.y = y + alto + 6;
  doc.x = MARGEN;
}

/**
 * Las columnas de la tabla. Los anchos fijos se reducen en proporción si el tamaño de texto del colegio o la cantidad de periodos no dejan lugar
 * al nombre (mínimo 120 pt): antes el nombre quedaba con ancho negativo y se montaba sobre las notas.
 */
function columnasDe(e: Estilo, informe: InformeFinal, descriptivo: boolean): { columnas: Columna[]; anchoNombre: number } {
  const { doc, u } = e;
  const ancho = doc.page.width - MARGEN * 2;
  const periodos = informe.periodos;
  const definicion: Array<Omit<Columna, 'x' | 'ancho'> & { base: number }> = [
    ...periodos.map((periodo, i) => ({
      titulo: `P${periodo.numero}`,
      base: descriptivo ? 32 : 30,
      valor: (a: AsignaturaInforme) => {
        const celda = a.periodos[i];
        if (!celda) return '';
        if (descriptivo) return celda.valoracion ? SIGLA_NIVEL_VALORACION[celda.valoracion] : '—';
        return celda.exenta ? 'E' : nota(celda.nota);
      },
      valorArea: () => '',
    })),
  ];
  if (descriptivo) {
    definicion.push({
      titulo: 'NIVEL FINAL',
      base: 84,
      negrita: true,
      valor: (a) => (a.nivel_descriptivo ? NOMBRES_NIVEL_VALORACION[a.nivel_descriptivo] : '—'),
      valorArea: () => '',
    });
  } else {
    definicion.push(
      { titulo: 'AÑO', base: 34, valor: (a) => (a.exenta ? 'E' : nota(a.nota_anual)), valorArea: () => '' },
      { titulo: 'RECUP.', base: 36, valor: (a) => (a.nota_recuperacion === null ? '' : nota(a.nota_recuperacion)), valorArea: () => '' },
      { titulo: 'FINAL', base: 34, negrita: true, enArea: true, valor: (a) => (a.exenta ? 'E' : nota(a.nota_final)), valorArea: (ar) => nota(ar.nota_final) },
      { titulo: 'NIVEL', base: 84, enArea: true, valor: (a) => a.desempeno?.etiqueta ?? '', valorArea: (ar) => ar.desempeno?.etiqueta ?? '' }
    );
  }
  definicion.push({ titulo: 'FALLAS', base: 38, valor: (a) => (a.fallas > 0 ? String(a.fallas) : ''), valorArea: () => '' });

  const fijo = definicion.reduce((s, c) => s + u(c.base), 0);
  const escala = ancho - fijo < 120 ? Math.max(0.5, (ancho - 120) / fijo) : 1;
  const anchoNombre = ancho - fijo * escala;
  let x = MARGEN + anchoNombre;
  const columnas = definicion.map((c) => {
    const w = u(c.base) * escala;
    const columna: Columna = { titulo: c.titulo, ancho: w, x, valor: c.valor, valorArea: c.valorArea, negrita: c.negrita, enArea: c.enArea };
    x += w;
    return columna;
  });
  return { columnas, anchoNombre };
}

function tabla(e: Estilo, informe: InformeFinal, s: EstudianteInforme): void {
  const { doc, fuente, u } = e;
  const ancho = doc.page.width - MARGEN * 2;
  const { columnas, anchoNombre } = columnasDe(e, informe, s.descriptivo);
  const relleno = u(2.5);
  const anchoTextoNombre = anchoNombre - 6;
  // En la fila de un área las columnas de notas están vacías: su título se extiende hasta la primera columna que sí lleva algo (o hasta el final).
  const primeraDeArea = columnas.find((c) => c.enArea);
  const anchoTextoArea = (primeraDeArea ? primeraDeArea.x - MARGEN : ancho) - 8;
  const columnaNivel = columnas.find((c) => c.titulo === 'NIVEL' || c.titulo === 'NIVEL FINAL');

  /** El alto de una línea de texto con la fuente y el tamaño dados. */
  const lineaDe = (f: string, tam: number): number => doc.font(f).fontSize(tam).currentLineHeight();
  /** El alto que ocupa un texto que puede partirse en varias líneas dentro de un ancho. */
  const altoDe = (texto: string, f: string, tam: number, w: number): number => doc.font(f).fontSize(tam).heightOfString(texto || ' ', { width: w });

  const cabecera = () => {
    const alto = u(18);
    asegurarEspacio(e, alto + u(24));
    const y = doc.y;
    doc.rect(MARGEN, y, ancho, alto).fill(COLOR.primario);
    doc.font(fuente.b).fontSize(u(7.5)).fillColor('#FFFFFF');
    const yTexto = y + (alto - doc.currentLineHeight()) / 2;
    doc.text('ÁREA / ASIGNATURA', MARGEN + 6, yTexto, { width: anchoTextoNombre, lineBreak: false });
    for (const c of columnas) doc.text(c.titulo, c.x, yTexto, { width: c.ancho, align: 'center', lineBreak: false });
    doc.y = y + alto + u(3);
  };
  cabecera();

  /** Una fila (de asignatura o de área): su alto sale de lo que ocupen el nombre y el nivel, así nada se monta sobre la fila siguiente. */
  const alturaDeFila = (nombre: string, nivel: string, fNombre: string, tam: number, anchoNombreFila = anchoTextoNombre): number =>
    Math.max(altoDe(nombre, fNombre, tam, anchoNombreFila), columnaNivel ? altoDe(nivel, fuente.n, tam - 0.5, columnaNivel.ancho - 4) : 0, lineaDe(fuente.n, tam)) + relleno * 2;

  const fila = (a: AsignaturaInforme) => {
    const tam = u(8.5);
    const alto = alturaDeFila(a.nombre, columnaNivel ? columnaNivel.valor(a) : '', fuente.n, tam);
    asegurarEspacio(e, alto, cabecera);
    const y = doc.y;
    const linea = lineaDe(fuente.n, tam);
    // Las cifras van centradas en vertical: con un nombre de dos líneas no quedan pegadas a la primera.
    const yCentro = y + (alto - linea) / 2;
    doc.font(fuente.n).fontSize(tam).fillColor(COLOR.ink).text(a.nombre, MARGEN + 6, y + relleno, { width: anchoTextoNombre });
    for (const c of columnas) {
      const esNivel = c === columnaNivel;
      doc
        .font(c.negrita ? fuente.b : fuente.n)
        .fontSize(esNivel ? tam - 0.5 : tam)
        .fillColor(c.negrita ? COLOR.ink : COLOR.cuerpo);
      const texto = c.valor(a);
      if (esNivel) doc.text(texto, c.x + 2, y + relleno, { width: c.ancho - 4, align: 'center' });
      else doc.text(texto, c.x, yCentro, { width: c.ancho, align: 'center', lineBreak: false });
    }
    doc.y = y + alto;
    doc.moveTo(MARGEN, doc.y).lineWidth(0.3).strokeColor(COLOR.borde).lineTo(MARGEN + ancho, doc.y).stroke();
  };

  const filaDeArea = (area: AreaInforme) => {
    const tam = u(8.5);
    const alto = alturaDeFila(area.nombre.toUpperCase(), columnaNivel ? columnaNivel.valorArea(area) : '', fuente.b, tam, anchoTextoArea);
    const primera = area.asignaturas[0];
    // El título de un área no se deja solo al final de la hoja: va con su primera asignatura.
    asegurarEspacio(e, alto + (primera ? alturaDeFila(primera.nombre, columnaNivel ? columnaNivel.valor(primera) : '', fuente.n, tam) : 0), cabecera);
    const y = doc.y;
    doc.rect(MARGEN, y, ancho, alto).fill(COLOR.suave);
    doc.font(fuente.b).fontSize(tam).fillColor(COLOR.ink).text(area.nombre.toUpperCase(), MARGEN + 6, y + relleno, { width: anchoTextoArea });
    const yCentro = y + (alto - lineaDe(fuente.b, tam)) / 2;
    for (const c of columnas) {
      const texto = c.valorArea(area);
      if (!texto) continue;
      const esNivel = c === columnaNivel;
      doc.font(esNivel ? fuente.n : fuente.b).fontSize(esNivel ? tam - 0.5 : tam).fillColor(COLOR.ink);
      if (esNivel) doc.text(texto, c.x + 2, y + relleno, { width: c.ancho - 4, align: 'center' });
      else doc.text(texto, c.x, yCentro, { width: c.ancho, align: 'center', lineBreak: false });
    }
    doc.y = y + alto;
  };

  for (const area of s.areas) {
    filaDeArea(area);
    for (const a of area.asignaturas) fila(a);
  }
  if (s.areas.length === 0) doc.font(fuente.n).fontSize(u(9)).fillColor(COLOR.tenue).text('Este grupo no tiene asignaturas con docente asignado.', MARGEN, doc.y);
  doc.x = MARGEN;
}

function notasAlPie(e: Estilo, informe: InformeFinal, s: EstudianteInforme): void {
  const { doc, fuente, u } = e;
  const ancho = doc.page.width - MARGEN * 2;
  const texto = s.descriptivo
    ? [
        'Preescolar no tiene notas ni promedios (Decreto 2247 de 1997).',
        `P1…P${informe.periodos.length}: nivel de la valoración descriptiva de cada periodo (${LEYENDA_SIGLAS_VALORACION}). NIVEL FINAL: el del último periodo valorado. —: aún sin valoración.`,
        s.completo ? '' : 'Faltan valoraciones por registrar en algunas asignaturas: este informe es parcial.',
      ]
    : [
        `Nota aprobatoria: ${informe.nota_aprobatoria.toFixed(1)}.`,
        'P1…P4: nota efectiva de cada periodo (con la recuperación del periodo si la hubo). AÑO: nota del año antes de la recuperación final. RECUP.: nota tras la recuperación final, solo si cambió la del año.',
        'E: exenta por traslado. —: aún no hay nota cerrada.',
        s.completo ? '' : 'El estudiante tiene asignaturas sin nota del año: este informe es parcial y no hay promedio definitivo.',
      ];
  const cuerpo = texto.filter(Boolean).join(' ');
  doc.font(fuente.i).fontSize(u(7.5));
  asegurarEspacio(e, doc.heightOfString(cuerpo, { width: ancho }) + u(8));
  doc.y += u(5);
  doc.font(fuente.i).fontSize(u(7.5)).fillColor(COLOR.tenue).text(cuerpo, MARGEN, doc.y, { width: ancho });
}

function promocion(e: Estilo, s: EstudianteInforme): void {
  const { doc, fuente, u } = e;
  const ancho = doc.page.width - MARGEN * 2;
  asegurarEspacio(e, u(58));
  doc.moveDown(0.6).font(fuente.b).fontSize(u(9)).fillColor(e.p.color_acento).text('ESTADO FINAL DE PROMOCIÓN', MARGEN, doc.y, { characterSpacing: 0.4 });
  doc.moveDown(0.25);
  const y = doc.y;
  doc.roundedRect(MARGEN, y, ancho, u(30), 4).fillAndStroke(COLOR.suave, COLOR.borde);
  doc.font(fuente.b).fontSize(u(11)).fillColor(COLOR.ink).text(s.promocion.oficial ? s.promocion.texto : `${s.promocion.texto} (proyectado)`, MARGEN + 10, y + u(9), { width: ancho - 20 });
  doc.y = y + u(36);
  if (!s.promocion.oficial) {
    doc.font(fuente.i).fontSize(u(8)).fillColor(COLOR.peligro).text('Proyección con las notas registradas hasta hoy; la decisión oficial la toma el cierre de promoción del colegio.', MARGEN, doc.y, { width: ancho });
  } else if (s.descriptivo) {
    doc.font(fuente.i).fontSize(u(8)).fillColor(COLOR.tenue).text('Preescolar no reprueba: el estudiante avanza al grado siguiente (Decreto 2247 de 1997).', MARGEN, doc.y, { width: ancho });
  }
}

function firmas(e: Estilo, informe: InformeFinal): void {
  const { doc, p, fuente, u } = e;
  if (p.firmas.length === 0) return;
  asegurarEspacio(e, u(84));
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

/** Dibuja el informe final: un estudiante por hoja (sigue en otra, con su cabecera, si no cabe), con el diseño del boletín del colegio. Pura: no toca la base. */
export async function renderizarInformeFinal(informe: InformeFinal, logo: Buffer | null, p: PlantillaBoletin): Promise<Buffer> {
  const escudo = p.escudo.mostrar ? (imagenDesdeDataUri(p.escudo.url)?.buffer ?? logo) : null;
  const { doc, listo } = nuevoDocumento(p.papel);
  const factor = ESCALA_TEXTO[p.tamano_texto];
  const e: Estilo = { doc, p, fuente: FUENTES[p.fuente], u: (n) => n * factor, continuar: () => undefined };
  if (escudo && p.escudo.posicion === 'MARCA_DE_AGUA') doc.on('pageAdded', () => dibujarMarcaDeAgua(doc, escudo, p.escudo.tamano));
  const generado = informe.generado_en.toLocaleString('es-CO', { timeZone: 'America/Bogota' });

  if (informe.estudiantes.length === 0) {
    doc.addPage();
    doc.font(e.fuente.n).fontSize(e.u(11)).fillColor(COLOR.cuerpo).text('Este grupo no tiene estudiantes con matrícula activa.');
  }
  for (const s of informe.estudiantes) {
    let hoja = 1;
    const textoPie = () => `Generado el ${generado} · ${informe.grupo.etiqueta} · ${s.nombre_completo} · hoja ${hoja}`;
    e.continuar = () => {
      pie(e, textoPie());
      hoja += 1;
      doc.addPage();
      cabeceraDeContinuacion(e, informe, s);
    };
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
    pie(e, textoPie());
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
