import PDFDocument from 'pdfkit';
import { ClaveTextoBoletin, FuenteBoletin, PLANTILLA_BOLETIN_INICIAL, PlantillaBoletin, TamanoTextoBoletin } from '../constants/boletin';
import { UserDocument } from '../models/user.model';
import { imagenDesdeDataUri } from '../utils/almacenImagenes';
import { completarPlantilla, rellenarTexto } from '../utils/plantillaBoletin';
import { registrarEvento } from './audit.service';
import { leerConfiguracionBoletin, validarEscudo } from './boletinConfig.service';
import { armarBoletinDeMuestra } from './boletinMuestra.service';
import { cargarLogo, COLOR, MARGEN } from './encabezadoInstitucional.service';
import { BoletinesDeGrupoParams, generarBoletinesDeGrupo, generateReportCard, ReportCardParams, ReportCardResult } from './reportCard.service';

type Documento = InstanceType<typeof PDFDocument>;

const NOMBRE_NIVEL_NACIONAL = { SUPERIOR: 'Superior', ALTO: 'Alto', BASICO: 'Básico', BAJO: 'Bajo' } as const;
const OPACIDAD_MARCA_DE_AGUA = 0.07;

/** Las tres familias de letra que trae el PDF: normal, negrita y cursiva de cada una. */
const FUENTES: Record<FuenteBoletin, { n: string; b: string; i: string }> = {
  SANS: { n: 'Helvetica', b: 'Helvetica-Bold', i: 'Helvetica-Oblique' },
  SERIF: { n: 'Times-Roman', b: 'Times-Bold', i: 'Times-Italic' },
  MONO: { n: 'Courier', b: 'Courier-Bold', i: 'Courier-Oblique' },
};
const ESCALA_TEXTO: Record<TamanoTextoBoletin, number> = { PEQUENO: 0.9, NORMAL: 1, GRANDE: 1.12 };

/**
 * La letra y el tamaño del colegio. Son del documento que se está dibujando: `renderizarBoletines` los fija antes de dibujar y todo el dibujo es
 * síncrono, así que no se mezclan entre dos documentos. `u` escala tanto los tamaños de letra como las alturas, para que un texto más grande no se salga de su caja.
 */
let fuente = FUENTES.SANS;
let factor = 1;
const u = (n: number): number => n * factor;

const nota = (n: number | null): string => (n === null ? '—' : n.toFixed(2));

/** Todo lo que el dibujo de un boletín necesita: el documento, el boletín, el diseño del colegio y el escudo ya resuelto. */
interface Contexto {
  doc: Documento;
  b: ReportCardResult;
  p: PlantillaBoletin;
  escudo: Buffer | null;
}

/** Un texto fijo del documento, el del colegio, con sus marcas (`{puesto}`, `{fecha}`...) ya reemplazadas. */
const t = ({ p }: Contexto, clave: ClaveTextoBoletin, valores: Record<string, string | number> = {}): string => rellenarTexto(p.textos[clave], valores);

function fechaLarga(fecha: Date): string {
  // Las fechas de calendario se guardan a medianoche UTC (M05): se formatean en UTC para no mostrar el día anterior.
  return new Date(fecha).toLocaleDateString('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Si lo que sigue no cabe en lo que queda de la hoja, abre una nueva antes de dibujarlo. */
function asegurarEspacio(doc: Documento, alto: number): void {
  if (doc.y + alto > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

/** El título y el texto que le sigue se mantienen juntos: si no caben en la hoja, pasan completos a la siguiente. Un título vacío no se dibuja. */
function titulo({ doc, p }: Contexto, texto: string, altoContenido = 24): void {
  if (!texto.trim()) return;
  asegurarEspacio(doc, u(28) + altoContenido);
  doc.moveDown(0.6).font(fuente.b).fontSize(u(9)).fillColor(p.color_acento).text(texto.toUpperCase(), MARGEN, doc.y, { characterSpacing: 0.4 });
  doc.moveDown(0.25);
}

/** El escudo grande y tenue detrás del contenido: se pinta al abrir cada hoja, sin mover el cursor de texto. */
function dibujarMarcaDeAgua(doc: Documento, escudo: Buffer, tamano: number): void {
  const lado = Math.min(tamano * 4, doc.page.width - MARGEN * 2, 360);
  const yGuardado = doc.y;
  doc.save();
  doc.opacity(OPACIDAD_MARCA_DE_AGUA);
  try {
    doc.image(escudo, (doc.page.width - lado) / 2, (doc.page.height - lado) / 2, { fit: [lado, lado], align: 'center', valign: 'center' });
  } catch {
    // Imagen corrupta o formato que pdfkit no lee: el boletín no depende del escudo.
  }
  doc.restore();
  doc.y = yGuardado;
}

function encabezado(c: Contexto): void {
  const { doc, b, p, escudo } = c;
  const inicioY = doc.y;
  const ancho = doc.page.width - MARGEN * 2;
  const posicion = p.escudo.posicion;
  const lado = p.escudo.tamano;
  const conEscudo = escudo !== null && posicion !== 'MARCA_DE_AGUA';
  const centrado = conEscudo && posicion === 'CENTRO';
  const alineacion = centrado ? 'center' : 'left';

  const dibujarEscudo = (x: number, y: number) => {
    try {
      doc.image(escudo as Buffer, x, y, { fit: [lado, lado] });
    } catch {
      // Imagen corrupta o formato que pdfkit no lee: el boletín no depende del escudo.
    }
  };

  let xTexto = MARGEN;
  let anchoTexto = ancho;
  if (conEscudo && posicion === 'CENTRO') {
    dibujarEscudo((doc.page.width - lado) / 2, inicioY);
    doc.y = inicioY + lado + 6;
  } else if (conEscudo && posicion === 'IZQUIERDA') {
    dibujarEscudo(MARGEN, inicioY);
    xTexto = MARGEN + lado + 12;
    anchoTexto = ancho - lado - 12;
  } else if (conEscudo && posicion === 'DERECHA') {
    dibujarEscudo(doc.page.width - MARGEN - lado, inicioY);
    anchoTexto = ancho - lado - 12;
  }

  const yTexto = centrado ? doc.y : inicioY;
  doc.font(fuente.b).fontSize(u(12)).fillColor(COLOR.ink).text(b.institucion.nombre, xTexto, yTexto, { width: anchoTexto, align: alineacion });
  doc.font(fuente.n).fontSize(u(8.5)).fillColor(COLOR.tenue);
  if (p.mostrar_datos_institucion) {
    const linea = [
      b.institucion.codigo_dane && `DANE ${b.institucion.codigo_dane}`,
      b.institucion.nit && `NIT ${b.institucion.nit}`,
      b.institucion.resolucion_aprobacion && `Res. ${b.institucion.resolucion_aprobacion}`,
    ]
      .filter(Boolean)
      .join(' · ');
    if (linea) doc.text(linea, xTexto, doc.y, { width: anchoTexto, align: alineacion });
  }
  if (p.mostrar_sede_jornada) {
    doc.text(`${b.estudiante.sede} · ${t(c, 'jornada')} ${b.estudiante.jornada.toLowerCase()}`, xTexto, doc.y, { width: anchoTexto, align: alineacion });
  }
  doc.y = Math.max(doc.y, conEscudo && !centrado ? inicioY + lado + 4 : inicioY + u(40));
  doc.x = MARGEN;

  doc.moveDown(0.5);
  if (p.titulo.trim()) doc.font(fuente.b).fontSize(u(15)).fillColor(COLOR.ink).text(p.titulo, MARGEN, doc.y, { width: ancho, align: alineacion });
  const periodo = t(c, 'periodo_linea', { periodo: b.nombre_periodo || `Periodo ${b.periodo}`, anio: b.academic_year });
  doc.font(fuente.n).fontSize(u(10)).fillColor(COLOR.cuerpo).text(periodo, MARGEN, doc.y, { width: ancho, align: alineacion });
  if (p.subtitulo.trim()) doc.font(fuente.i).fontSize(u(9.5)).fillColor(COLOR.tenue).text(p.subtitulo, MARGEN, doc.y, { width: ancho, align: alineacion });
}

function avisoMuestra({ doc }: Contexto): void {
  doc
    .moveDown(0.4)
    .font(fuente.b)
    .fontSize(u(8.5))
    .fillColor(COLOR.peligro)
    .text('MUESTRA: los datos del estudiante y las notas son inventados. La institución, la escala, los textos y la configuración son los reales del colegio.', MARGEN, doc.y, {
      width: doc.page.width - MARGEN * 2,
    });
}

function datosEstudiante(c: Contexto, tituloSeccion: string): void {
  const { doc, b, p } = c;
  const alto = u(58);
  titulo(c, tituloSeccion, alto + u(6));
  const ancho = doc.page.width - MARGEN * 2;
  asegurarEspacio(doc, alto + u(12));
  const y = doc.moveDown(0.6).y;
  doc.roundedRect(MARGEN, y, ancho, alto, 4).fillAndStroke(COLOR.suave, COLOR.borde);
  doc.fillColor(COLOR.ink).font(fuente.b).fontSize(u(11)).text(b.estudiante.nombre_completo, MARGEN + 10, y + u(8), { width: ancho * 0.6 });

  doc.font(fuente.n).fontSize(u(8.5)).fillColor(COLOR.cuerpo);
  const identificacion = [
    p.estudiante.documento && `${t(c, 'documento')} ${b.estudiante.documento}`,
    p.estudiante.grado && b.estudiante.grado && `${t(c, 'grado')} ${b.estudiante.grado}`,
    p.estudiante.grupo && `${t(c, 'grupo')} ${b.estudiante.grupo}`,
  ]
    .filter(Boolean)
    .join(' · ');
  if (identificacion) doc.text(identificacion, MARGEN + 10, y + u(24), { width: ancho * 0.64 });
  if (p.estudiante.inasistencias) {
    const a = b.asistencia_periodo;
    doc.text(
      `${t(c, 'inasistencias')}: ${a.total_fallas_justificadas} ${t(c, 'justificadas')} · ${a.total_fallas_injustificadas} ${t(c, 'injustificadas')} · ${a.total_retardos} ${t(c, 'retardos')}`,
      MARGEN + 10,
      y + u(38),
      { width: ancho * 0.66 }
    );
  }

  const xDerecha = MARGEN + ancho * 0.68;
  const anchoDerecha = ancho * 0.32 - 10;
  if (p.estudiante.promedio) {
    doc.font(fuente.n).fontSize(u(8)).fillColor(COLOR.tenue).text(t(c, 'promedio_general').toUpperCase(), xDerecha, y + u(8), { width: anchoDerecha, align: 'right' });
    doc.font(fuente.b).fontSize(u(16)).fillColor(COLOR.ink).text(nota(b.promedio_general_periodo), xDerecha, y + u(19), { width: anchoDerecha, align: 'right' });
  }
  const resumen = [
    p.estudiante.promedio ? b.desempeno_general?.etiqueta : null,
    b.mostrar_puesto && b.puesto_grupo !== null ? t(c, 'puesto', { puesto: b.puesto_grupo, total: b.total_estudiantes_grupo }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  if (resumen) doc.font(fuente.n).fontSize(u(8.5)).fillColor(COLOR.cuerpo).text(resumen, xDerecha, y + u(41), { width: anchoDerecha, align: 'right' });
  doc.y = y + alto + 6;
  doc.x = MARGEN;
}

function avisoNoOficial(c: Contexto): void {
  const { doc, b } = c;
  if (b.completo) return;
  const ancho = doc.page.width - MARGEN * 2;
  const faltan = b.pendientes.length ? ` ${t(c, 'informe_parcial_faltan', { pendientes: b.pendientes.join(', ') })}` : '';
  doc.font(fuente.i).fontSize(u(8.5)).fillColor(COLOR.peligro).text(`${t(c, 'informe_parcial')}${faltan}`, MARGEN, doc.y, { width: ancho });
  doc.moveDown(0.3);
}

type AsignaturaVista = ReportCardResult['areas'][number]['asignaturas'][number];

function areas(c: Contexto, tituloSeccion: string): void {
  const { doc, b, p } = c;
  titulo(c, tituloSeccion, u(40));
  avisoNoOficial(c);
  const ancho = doc.page.width - MARGEN * 2;
  const a = p.asignaturas;
  // Las columnas que el colegio apagó no ocupan lugar: el nombre de la asignatura toma el espacio que queda.
  const anchoNota = a.nota ? u(48) : 0;
  const anchoNivel = a.desempeno ? u(78) : 0;
  const anchoFallas = a.fallas ? u(54) : 0;
  const anchoNombre = ancho - anchoNota - anchoNivel - anchoFallas;
  const xNota = MARGEN + anchoNombre;
  const xNivel = xNota + anchoNota;
  const xFallas = xNivel + anchoNivel;

  const detalles = (asig: AsignaturaVista): Array<[string, string]> => {
    const lista: Array<[string, string]> = [];
    if (a.componentes && asig.componentes.length > 0) {
      lista.push([p.rotulos.componentes, asig.componentes.map((x) => `${x.nombre} ${x.porcentaje}%: ${x.nota.toFixed(2)}`).join(' · ')]);
    }
    if (a.descripcion && asig.descripcion) lista.push([p.rotulos.descripcion, asig.descripcion]);
    if (a.recomendacion && asig.recomendacion) lista.push([p.rotulos.recomendacion, asig.recomendacion]);
    if (a.observacion && asig.observacion_docente) lista.push([p.rotulos.observacion, asig.observacion_docente]);
    if (asig.homologacion) lista.push([asig.homologacion.estado === 'EXENTA_POR_TRASLADO' ? t(c, 'exenta') : t(c, 'homologada'), asig.homologacion.detalle]);
    if (asig.recuperacion) {
      const r = asig.recuperacion;
      lista.push(['Recuperación', r.cuenta ? `nota del periodo ${nota(r.nota_original)}, con la recuperación ${nota(r.nota_resultante)}.` : `presentada (${nota(r.nota_resultante)}); la nota del periodo se conserva en ${nota(r.nota_original)}.`]);
    }
    return lista;
  };

  for (const area of b.areas) {
    asegurarEspacio(doc, u(24) + u(40));
    const y = doc.y;
    doc.rect(MARGEN, y, ancho, u(17)).fill(COLOR.suave);
    doc.font(fuente.b).fontSize(u(9)).fillColor(COLOR.ink).text(area.nombre.toUpperCase(), MARGEN + 6, y + u(5), { width: anchoNombre - 6, lineBreak: false });
    if (a.nota_area && a.nota) doc.text(area.exenta ? 'E' : nota(area.nota_area), xNota, y + u(5), { width: anchoNota, align: 'center', lineBreak: false });
    if (a.nota_area && a.desempeno) doc.font(fuente.n).text(area.desempeno_area?.etiqueta ?? '', xNivel, y + u(5), { width: anchoNivel, align: 'center', lineBreak: false });
    doc.y = y + u(21);

    for (const asig of area.asignaturas) {
      asegurarEspacio(doc, u(40));
      const filaY = doc.y;
      doc.font(fuente.b).fontSize(u(9)).fillColor(COLOR.ink).text(asig.nombre, MARGEN + 6, filaY, { width: anchoNombre - 6, lineBreak: false });
      if (a.nota) doc.font(fuente.b).text(notaDeAsignatura(asig), xNota, filaY, { width: anchoNota, align: 'center', lineBreak: false });
      const nivel = asig.estado === 'EXENTA_POR_TRASLADO' ? t(c, 'exenta') : asig.desempeno?.etiqueta ?? t(c, 'sin_cerrar');
      if (a.desempeno) doc.font(fuente.n).fillColor(COLOR.cuerpo).text(nivel, xNivel, filaY, { width: anchoNivel, align: 'center', lineBreak: false });
      if (a.fallas) doc.font(fuente.n).fillColor(COLOR.cuerpo).text(asig.fallas_asignatura > 0 ? `${asig.fallas_asignatura} ${t(c, 'falla')}` : '', xFallas, filaY, { width: anchoFallas, align: 'center', lineBreak: false });
      doc.y = filaY + u(13);

      for (const [rotulo, texto] of detalles(asig)) {
        const completo = rotulo ? `${rotulo}: ${texto}` : texto;
        const alto = doc.font(fuente.n).fontSize(u(8)).heightOfString(completo, { width: ancho - 14 });
        asegurarEspacio(doc, alto + 3);
        if (rotulo) {
          doc.font(fuente.b).fontSize(u(8)).fillColor(COLOR.tenue).text(`${rotulo}: `, MARGEN + 10, doc.y, { width: ancho - 14, continued: true });
          doc.font(fuente.n).fillColor(COLOR.cuerpo).text(texto);
        } else {
          doc.font(fuente.n).fontSize(u(8)).fillColor(COLOR.cuerpo).text(texto, MARGEN + 10, doc.y, { width: ancho - 14 });
        }
      }
      doc.moveDown(0.35);
      doc.moveTo(MARGEN, doc.y).lineTo(MARGEN + ancho, doc.y).lineWidth(0.4).strokeColor(COLOR.borde).stroke();
      doc.moveDown(0.3);
    }
  }
  if (b.areas.length === 0) {
    doc.font(fuente.n).fontSize(u(9)).fillColor(COLOR.tenue).text(t(c, 'sin_malla'), MARGEN, doc.y);
  }
  convencionesTraslado(c);
}

/** «4.20 (H)» si la nota se homologó del colegio de origen; «E» si la asignatura es exenta por traslado. */
function notaDeAsignatura(asig: AsignaturaVista): string {
  if (asig.estado === 'EXENTA_POR_TRASLADO') return 'E';
  return asig.estado === 'HOMOLOGADA_EXTERNA' ? `${nota(asig.nota_asignatura)} (H)` : nota(asig.nota_asignatura);
}

/** Las notas al pie del traslado: de dónde viene el estudiante y qué significan (H) y E. Solo salen si el boletín las usa. */
function convencionesTraslado(c: Contexto): void {
  const { doc, b } = c;
  const todas = b.areas.flatMap((a) => a.asignaturas);
  const lineas = [
    b.traslado && t(c, 'traslado_linea', { fecha: fechaLarga(b.traslado.fecha_ingreso), institucion: b.traslado.institucion, periodo: b.traslado.nombre_periodo_ingreso }),
    todas.some((x) => x.estado === 'HOMOLOGADA_EXTERNA') && t(c, 'convencion_homologada'),
    todas.some((x) => x.estado === 'EXENTA_POR_TRASLADO') && t(c, 'convencion_exenta'),
  ].filter((x): x is string => Boolean(x && x.trim()));
  if (lineas.length === 0) return;
  const ancho = doc.page.width - MARGEN * 2;
  doc.moveDown(0.3);
  for (const linea of lineas) {
    const alto = doc.font(fuente.i).fontSize(u(7.5)).heightOfString(linea, { width: ancho });
    asegurarEspacio(doc, alto + 2);
    doc.font(fuente.i).fontSize(u(7.5)).fillColor(COLOR.tenue).text(linea, MARGEN, doc.y, { width: ancho });
  }
}

/**
 * Las asignaturas cerradas con desempeño bajo (no aprobatorio según la escala del colegio), con la recomendación de su nivel, y las actividades de
 * apoyo del colegio. La guía de boletines pide indicar en qué áreas hay dificultades y qué apoyo se ofrece (Decreto 1075, art. 2.3.3.3.3.11).
 */
function dificultades(c: Contexto, tituloSeccion: string): void {
  const { doc, b, p } = c;
  const ancho = doc.page.width - MARGEN * 2;
  const lista = b.areas.flatMap((area) => area.asignaturas.filter((x) => x.desempeno && !x.desempeno.aprobado).map((x) => ({ area: area.nombre, asignatura: x })));
  titulo(c, tituloSeccion, u(40));
  doc.font(fuente.n).fontSize(u(8.5)).fillColor(COLOR.cuerpo).text(lista.length > 0 ? t(c, 'dificultades_intro') : t(c, 'dificultades_ninguna'), MARGEN, doc.y, { width: ancho });
  for (const { area, asignatura } of lista) {
    const encabezadoFila = `• ${asignatura.nombre} (${area}) — ${nota(asignatura.nota_asignatura)} ${asignatura.desempeno?.etiqueta ?? ''}`;
    asegurarEspacio(doc, u(30));
    doc.moveDown(0.25).font(fuente.b).fontSize(u(8.5)).fillColor(COLOR.ink).text(encabezadoFila, MARGEN + 8, doc.y, { width: ancho - 8 });
    if (asignatura.recomendacion) doc.font(fuente.n).fontSize(u(8)).fillColor(COLOR.cuerpo).text(asignatura.recomendacion, MARGEN + 18, doc.y, { width: ancho - 18 });
  }
  if (p.texto_apoyo.trim()) {
    const alto = doc.font(fuente.n).fontSize(u(8.5)).heightOfString(p.texto_apoyo, { width: ancho });
    asegurarEspacio(doc, alto + u(8));
    doc.moveDown(0.5).font(fuente.n).fontSize(u(8.5)).fillColor(COLOR.cuerpo).text(p.texto_apoyo, MARGEN, doc.y, { width: ancho });
  }
}

/** La escala del colegio con su equivalencia nacional (Decreto 1075, art. 2.3.3.3.3.5). */
function escala(c: Contexto, tituloSeccion: string): void {
  const { doc, b } = c;
  const ancho = doc.page.width - MARGEN * 2;
  const alto = u(14);
  titulo(c, tituloSeccion, alto * (b.escala.length + 1));
  const columnas = [ancho * 0.34, ancho * 0.33, ancho * 0.33];
  asegurarEspacio(doc, alto * (b.escala.length + 1));
  let y = doc.y;
  const fila = (celdas: string[], negrita: boolean) => {
    let x = MARGEN;
    doc.font(negrita ? fuente.b : fuente.n).fontSize(u(8.5)).fillColor(negrita ? COLOR.ink : COLOR.cuerpo);
    celdas.forEach((celda, i) => {
      doc.text(celda, x + 4, y + u(3), { width: (columnas[i] ?? 0) - 8, lineBreak: false });
      x += columnas[i] ?? 0;
    });
    doc.rect(MARGEN, y, ancho, alto).lineWidth(0.4).strokeColor(COLOR.borde).stroke();
    y += alto;
  };
  fila([t(c, 'escala_columna_1'), t(c, 'escala_columna_2'), t(c, 'escala_columna_3')], true);
  for (const nivel of [...b.escala].sort((x, z) => z.valor_minimo - x.valor_minimo)) {
    fila([nivel.etiqueta, `${nivel.valor_minimo.toFixed(1)} – ${nivel.valor_maximo.toFixed(1)}`, t(c, 'escala_equivalencia', { nivel: NOMBRE_NIVEL_NACIONAL[nivel.nivel] })], false);
  }
  doc.y = y + u(6);
  doc.x = MARGEN;
}

function entrega(c: Contexto, tituloSeccion: string): void {
  const { doc, b } = c;
  if (!b.fecha_entrega) return;
  titulo(c, tituloSeccion, u(14));
  doc.font(fuente.n).fontSize(u(8.5)).fillColor(COLOR.cuerpo).text(t(c, 'fecha_entrega', { fecha: fechaLarga(b.fecha_entrega) }), MARGEN, doc.y, { width: doc.page.width - MARGEN * 2 });
}

/** Todas las fechas de entrega del año: la periodicidad de los informes que el SIEE debe definir y el colegio cumplir. */
function calendario(c: Contexto, tituloSeccion: string): void {
  const { doc, b } = c;
  if (b.calendario_entregas.length === 0) return;
  const ancho = doc.page.width - MARGEN * 2;
  const alto = u(14);
  titulo(c, tituloSeccion, alto * b.calendario_entregas.length);
  asegurarEspacio(doc, alto * b.calendario_entregas.length);
  let y = doc.y;
  for (const fila of b.calendario_entregas) {
    doc.font(fuente.n).fontSize(u(8.5)).fillColor(COLOR.cuerpo);
    doc.text(fila.periodo, MARGEN + 4, y + u(3), { width: ancho * 0.45, lineBreak: false });
    doc.text(fila.fecha ? fechaLarga(fila.fecha) : t(c, 'calendario_sin_fecha'), MARGEN + ancho * 0.45, y + u(3), { width: ancho * 0.55 - 4, lineBreak: false });
    doc.rect(MARGEN, y, ancho, alto).lineWidth(0.4).strokeColor(COLOR.borde).stroke();
    y += alto;
  }
  doc.y = y + u(6);
  doc.x = MARGEN;
}

function reclamaciones(c: Contexto, tituloSeccion: string): void {
  const { doc, b } = c;
  if (!b.canal_reclamaciones) return;
  const ancho = doc.page.width - MARGEN * 2;
  titulo(c, tituloSeccion, doc.font(fuente.n).fontSize(u(8.5)).heightOfString(b.canal_reclamaciones, { width: ancho }));
  doc.font(fuente.n).fontSize(u(8.5)).fillColor(COLOR.cuerpo).text(b.canal_reclamaciones, MARGEN, doc.y, { width: ancho });
}

/** Compromisos de seguimiento con el estudiante y la familia: renglones en blanco para escribirlos a mano en la entrega del informe. */
function compromisos(c: Contexto, tituloSeccion: string): void {
  const { doc, p } = c;
  const ancho = doc.page.width - MARGEN * 2;
  const paso = u(18);
  titulo(c, tituloSeccion, u(14) + paso * p.compromisos_lineas);
  asegurarEspacio(doc, u(14) + paso * p.compromisos_lineas);
  doc.font(fuente.n).fontSize(u(8.5)).fillColor(COLOR.cuerpo).text(t(c, 'compromisos_intro'), MARGEN, doc.y, { width: ancho });
  let y = doc.y + paso;
  for (let i = 0; i < p.compromisos_lineas; i += 1) {
    doc.moveTo(MARGEN, y).lineTo(MARGEN + ancho, y).lineWidth(0.5).strokeColor(COLOR.borde).stroke();
    y += paso;
  }
  doc.y = y - paso + 4;
  doc.x = MARGEN;
}

/**
 * La decisión de promoción del informe final. Si M19 ya cerró al estudiante (y hay algo que decirle a la familia) sale su resultado, con el
 * acta si lo decidió una instancia; si no, las casillas para que la comisión la marque a mano.
 */
function promocion(c: Contexto, tituloSeccion: string): void {
  const { doc, p, b } = c;
  const ancho = doc.page.width - MARGEN * 2;
  if (b.promocion) {
    titulo(c, tituloSeccion, u(40));
    doc.font(fuente.n).fontSize(u(8.5)).fillColor(COLOR.cuerpo).text(t(c, 'promocion_intro'), MARGEN, doc.y, { width: ancho });
    doc.font(fuente.b).fontSize(u(10)).fillColor(COLOR.ink).text(b.promocion.texto + (b.promocion.acta ? ` (acta ${b.promocion.acta})` : ''), MARGEN, doc.y + u(4), { width: ancho });
    doc.y += u(6);
    doc.x = MARGEN;
    return;
  }
  if (p.promocion_opciones.length === 0) return;
  titulo(c, tituloSeccion, u(40));
  doc.font(fuente.n).fontSize(u(8.5)).fillColor(COLOR.cuerpo).text(t(c, 'promocion_intro'), MARGEN, doc.y, { width: ancho });
  asegurarEspacio(doc, u(20));
  let x = MARGEN;
  let y = doc.y + u(6);
  const caja = u(9);
  for (const opcion of p.promocion_opciones) {
    const anchoOpcion = caja + 6 + doc.font(fuente.n).fontSize(u(8.5)).widthOfString(opcion) + u(18);
    if (x + anchoOpcion > MARGEN + ancho) {
      x = MARGEN;
      y += u(16);
    }
    doc.rect(x, y, caja, caja).lineWidth(0.7).strokeColor(COLOR.ink).stroke();
    doc.font(fuente.n).fontSize(u(8.5)).fillColor(COLOR.ink).text(opcion, x + caja + 6, y + 0.5, { lineBreak: false });
    x += anchoOpcion;
  }
  doc.y = y + u(18);
  doc.x = MARGEN;
}

/** Las firmas que el colegio definió: una línea por firmante, repartidas a lo ancho. Quien firma como director de grupo sale del grupo del estudiante. */
function firmas(c: Contexto, tituloSeccion: string): void {
  const { doc, b, p } = c;
  if (p.firmas.length === 0) return;
  titulo(c, tituloSeccion, u(70));
  asegurarEspacio(doc, u(70));
  const ancho = doc.page.width - MARGEN * 2;
  const columna = ancho / p.firmas.length;
  const yLinea = doc.y + u(44);
  p.firmas.forEach((firma, i) => {
    const x = MARGEN + i * columna + 12;
    const anchoLinea = columna - 24;
    doc.moveTo(x, yLinea).lineTo(x + anchoLinea, yLinea).lineWidth(0.6).strokeColor(COLOR.tenue).stroke();
    const nombre = firma.usa_director_grupo ? (b.director_grupo ?? '') : firma.nombre;
    doc.font(fuente.b).fontSize(u(8.5)).fillColor(COLOR.ink).text(firma.cargo, x, yLinea + 4, { width: anchoLinea, align: 'center' });
    if (nombre) doc.font(fuente.n).fontSize(u(8)).fillColor(COLOR.cuerpo).text(nombre, x, doc.y, { width: anchoLinea, align: 'center' });
  });
  doc.y = yLinea + u(34);
  doc.x = MARGEN;
}

function pie({ doc, p }: Contexto): void {
  if (!p.pie_texto.trim()) return;
  const ancho = doc.page.width - MARGEN * 2;
  const alto = doc.font(fuente.i).fontSize(u(8)).heightOfString(p.pie_texto, { width: ancho });
  asegurarEspacio(doc, alto + 12);
  doc.moveDown(0.8).font(fuente.i).fontSize(u(8)).fillColor(COLOR.tenue).text(p.pie_texto, MARGEN, doc.y, { width: ancho, align: 'center' });
}

function dibujarBoletin(c: Contexto, muestra: boolean): void {
  encabezado(c);
  if (muestra) avisoMuestra(c);
  // El orden, la visibilidad y el título de cada sección son del colegio.
  for (const seccion of c.p.secciones) {
    if (!seccion.visible) continue;
    switch (seccion.clave) {
      case 'DATOS_ESTUDIANTE':
        datosEstudiante(c, seccion.titulo);
        break;
      case 'AREAS':
        areas(c, seccion.titulo);
        break;
      case 'DIFICULTADES':
        dificultades(c, seccion.titulo);
        break;
      case 'ESCALA':
        escala(c, seccion.titulo);
        break;
      case 'ENTREGA':
        entrega(c, seccion.titulo);
        break;
      case 'CALENDARIO':
        calendario(c, seccion.titulo);
        break;
      case 'RECLAMACIONES':
        reclamaciones(c, seccion.titulo);
        break;
      case 'COMPROMISOS':
        compromisos(c, seccion.titulo);
        break;
      case 'PROMOCION':
        promocion(c, seccion.titulo);
        break;
      case 'FIRMAS':
        firmas(c, seccion.titulo);
        break;
    }
  }
  pie(c);
}

function nuevoDocumento(papel: PlantillaBoletin['papel']): { doc: Documento; listo: Promise<Buffer> } {
  const doc = new PDFDocument({ size: papel, margins: { top: MARGEN, left: MARGEN, right: MARGEN, bottom: 50 }, autoFirstPage: false });
  const partes: Buffer[] = [];
  doc.on('data', (parte: Buffer) => partes.push(parte));
  const listo = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });
  return { doc, listo };
}

const limpiarNombre = (texto: string): string => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export interface OpcionesBoletin {
  muestra?: boolean;
  /** El diseño del colegio; sin él, el diseño original. */
  plantilla?: PlantillaBoletin;
}

/**
 * Dibuja los boletines ya armados, uno por estudiante (cada uno empieza en hoja nueva y sigue si no cabe), con el diseño del colegio.
 * `logo` es el de la institución (M01): se usa cuando la plantilla no trae un escudo propio. Pura: no toca la base.
 */
export async function renderizarBoletines(boletines: ReportCardResult[], logo: Buffer | null, opciones: OpcionesBoletin = {}): Promise<Buffer> {
  const p = opciones.plantilla ?? PLANTILLA_BOLETIN_INICIAL;
  const escudo = p.escudo.mostrar ? (imagenDesdeDataUri(p.escudo.url)?.buffer ?? logo) : null;
  const { doc, listo } = nuevoDocumento(p.papel);
  fuente = FUENTES[p.fuente];
  factor = ESCALA_TEXTO[p.tamano_texto];
  if (escudo && p.escudo.posicion === 'MARCA_DE_AGUA') doc.on('pageAdded', () => dibujarMarcaDeAgua(doc, escudo, p.escudo.tamano));

  if (boletines.length === 0) {
    doc.addPage();
    doc.font(fuente.n).fontSize(u(11)).fillColor(COLOR.cuerpo).text('Este grupo no tiene estudiantes con matrícula activa.');
  }
  for (const b of boletines) {
    doc.addPage();
    dibujarBoletin({ doc, b, p, escudo }, opciones.muestra ?? false);
  }
  doc.end();
  return listo;
}

/** El boletín de un estudiante en papel: lo mismo que ve en pantalla (solo notas cerradas), con las mismas reglas de permiso. */
export async function generarPdfBoletin(params: ReportCardParams, usuario: UserDocument): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const boletin = await generateReportCard(params, usuario);
  const [configuracion, logo] = await Promise.all([leerConfiguracionBoletin(), cargarLogo()]);
  const buffer = await renderizarBoletines([boletin], logo, { plantilla: configuracion.plantilla });
  return { buffer, nombreArchivo: `boletin_${limpiarNombre(boletin.estudiante.nombre_completo)}_P${boletin.periodo}.pdf` };
}

/** Todos los boletines de un grupo en un solo PDF, uno por estudiante, listos para imprimir. */
export async function generarPdfBoletinesDeGrupo(
  params: BoletinesDeGrupoParams,
  usuario: UserDocument,
  ip?: string | null
): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const boletines = await generarBoletinesDeGrupo(params, usuario);
  const [configuracion, logo] = await Promise.all([leerConfiguracionBoletin(), cargarLogo()]);
  const buffer = await renderizarBoletines(boletines, logo, { plantilla: configuracion.plantilla });

  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'BOLETIN_GRUPO_DESCARGADO',
    entidad: 'Group',
    entidad_id: params.group_id,
    detalle: `periodo ${params.periodo_numero}: ${boletines.length} boletines`,
    ip,
  });
  return { buffer, nombreArchivo: `boletines_${limpiarNombre(boletines[0]?.estudiante.grupo ?? 'grupo')}_P${params.periodo_numero}.pdf` };
}

/**
 * El PDF de la muestra (administración): sirve para revisar el diseño antes de que llegue a las familias. Con `borrador` se dibuja
 * el diseño que se está editando, aún sin guardar; sin él, el guardado.
 */
export async function generarPdfMuestra(borrador?: Parameters<typeof completarPlantilla>[0]): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const [muestra, configuracion, logo] = await Promise.all([armarBoletinDeMuestra(), leerConfiguracionBoletin(), cargarLogo()]);
  if (borrador) validarEscudo(borrador.escudo?.url);
  const plantilla = borrador ? completarPlantilla(borrador) : configuracion.plantilla;
  return { buffer: await renderizarBoletines([muestra], logo, { muestra: true, plantilla }), nombreArchivo: 'boletin_muestra.pdf' };
}
