import { Types } from 'mongoose';
import PDFDocument from 'pdfkit';
import { ColorAsignatura } from '../constants/horarios';
import { Rol } from '../constants/enums';
import AcademicYear from '../models/academicYear.model';
import Campus from '../models/campus.model';
import Horario from '../models/horario.model';
import Institution from '../models/institution.model';
import JornadaOperativa from '../models/jornadaOperativa.model';
import ApiError from '../utils/ApiError';
import { asignarColoresAsignaturas } from '../utils/coloresHorario';
import { gruposDelUsuario, obtenerHorario } from './horario.service';

/**
 * GRUPO / DOCENTE: la malla de uno (con `entidadId`) o de todos, una página cada uno. GENERAL: la hoja total de los docentes.
 * TOTAL_GRUPOS: la hoja total de los grupos. COMPLETO: las dos hojas totales y después cada docente y cada grupo.
 */
export type VistaPdfHorario = 'GRUPO' | 'DOCENTE' | 'GENERAL' | 'TOTAL_GRUPOS' | 'COMPLETO';

// Los mismos tonos de la guía visual (Klassy UI Spec) que usan los PDF de asistencia.
const COLOR = {
  ink: '#172235',
  cuerpo: '#3F4D61',
  tenue: '#788794',
  borde: '#DDE4EC',
  primario: '#2878EA',
  primarioSuave: '#EAF3FF',
  alertaSuave: '#FFF5E6',
  alerta: '#F2A23A',
  suave: '#F1F5F9',
  blanco: '#FFFFFF',
};
const COLOR_REUNION: ColorAsignatura = { fondo: COLOR.alertaSuave, borde: COLOR.alerta };
const COLOR_SIN_ASIGNATURA: ColorAsignatura = { fondo: COLOR.primarioSuave, borde: COLOR.primario };
const MARGEN = 30;
const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const JORNADAS: Record<string, string> = { MANANA: 'Mañana', TARDE: 'Tarde', UNICA: 'Única', NOCTURNA: 'Nocturna', SABATINA: 'Sabatina' };

type Documento = InstanceType<typeof PDFDocument>;
type Marcador = Documento['outline'];
type DetalleCompleto = Awaited<ReturnType<typeof obtenerHorario>>;
/** Lo que el dibujo lee de una versión: sus sesiones, la estructura de la jornada y los nombres. */
export type DetalleParaPdf = Pick<DetalleCompleto, 'horario' | 'estructura' | 'catalogo'>;
type Detalle = DetalleParaPdf;
type Sesion = Detalle['horario']['sesiones'][number];

interface Usuario {
  _id: Types.ObjectId;
  rol: Rol;
}

/** Lo que cambia de un horario a otro dentro de un mismo documento: quién lo encabeza y de qué jornada es. */
export interface ContextoHoja {
  institucion: string;
  subtitulo: string;
}

/**
 * Quién puede bajar qué: ADMIN y COORDINADOR, cualquier vista de cualquier versión. El resto, solo versiones publicadas y
 * solo lo suyo: el docente su horario; el estudiante y el acudiente, el de su(s) grupo(s). Las hojas totales son de gestión.
 */
async function exigirPermiso(usuario: Usuario, horario: { estado: string; academic_year_id: Types.ObjectId }, vista: VistaPdfHorario, entidadId?: string) {
  if (usuario.rol === 'ADMIN' || usuario.rol === 'COORDINADOR') return;
  const negar = () => {
    throw new ApiError(403, 'No tienes permiso para descargar este horario.');
  };
  if (horario.estado !== 'PUBLICADO' || (vista !== 'GRUPO' && vista !== 'DOCENTE') || !entidadId) return negar();
  if (usuario.rol === 'DOCENTE') {
    if (vista !== 'DOCENTE' || entidadId !== String(usuario._id)) negar();
    return;
  }
  if (usuario.rol === 'ESTUDIANTE' || usuario.rol === 'ACUDIENTE') {
    const propios = await gruposDelUsuario(usuario, horario.academic_year_id);
    if (vista !== 'GRUPO' || !propios.some((g) => g.group_id === entidadId)) negar();
    return;
  }
  negar();
}

function nombres(detalle: Detalle) {
  const { catalogo } = detalle;
  const asignatura = new Map(catalogo.asignaturas.map((s) => [s._id, s]));
  const grupo = new Map(catalogo.grupos.map((g) => [g._id, g]));
  const docente = new Map(catalogo.docentes.map((d) => [d._id, d]));
  const espacio = new Map(catalogo.espacios.map((e) => [e._id, e.nombre]));
  const reunion = new Map(catalogo.reuniones.map((r) => [r._id, r.nombre]));
  return {
    titulo: (s: Sesion) => (s.subject_id ? (asignatura.get(String(s.subject_id))?.nombre ?? '') : (reunion.get(String(s.reunion_variable_id)) ?? 'Reunión')),
    corto: (s: Sesion) => (s.subject_id ? (asignatura.get(String(s.subject_id))?.abreviatura ?? '') : 'Reun.'),
    color: (s: Sesion): ColorAsignatura => (s.subject_id ? (asignatura.get(String(s.subject_id))?.color ?? COLOR_SIN_ASIGNATURA) : COLOR_REUNION),
    grupo: (id: Types.ObjectId | null) => (id ? (grupo.get(String(id))?.etiqueta ?? '') : ''),
    grupoCorto: (id: Types.ObjectId | null) => (id ? (grupo.get(String(id))?.etiqueta_corta ?? '') : ''),
    docentes: (s: Sesion) => s.docente_ids.map((d) => docente.get(String(d))?.nombre ?? '').join(', '),
    docentesCortos: (s: Sesion) => s.docente_ids.map((d) => docente.get(String(d))?.nombre_corto ?? '').join(' / '),
    espacio: (id: Types.ObjectId | null) => (id ? (espacio.get(String(id)) ?? '') : ''),
  };
}
type Nombres = ReturnType<typeof nombres>;

// ------------------------------------------------------------------ documento

function crearDocumento() {
  const doc = new PDFDocument({ autoFirstPage: false, bufferPages: true, margins: { top: MARGEN, left: MARGEN, right: MARGEN, bottom: MARGEN } });
  const partes: Buffer[] = [];
  doc.on('data', (p: Buffer) => partes.push(p));
  const listo = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });
  return { doc, listo };
}

/** Las hojas totales llevan muchas columnas y se dibujan en A3; las mallas de un grupo o un docente, en carta. */
function nuevaPagina(doc: Documento, grande = false) {
  doc.addPage({ size: grande ? 'A3' : 'LETTER', layout: 'landscape', margins: { top: MARGEN, left: MARGEN, right: MARGEN, bottom: MARGEN } });
}

/** Deja un marcador (el índice lateral del visor de PDF) sobre la página abierta, colgado de `padre` o de la raíz. */
function marcar(padre: Marcador | null, doc: Documento, titulo: string): Marcador {
  return (padre ?? doc.outline).addItem(titulo);
}

/** «Página n de N» arriba a la derecha y la fecha de generación abajo, ya con todas las páginas escritas. */
function pieDePaginas(doc: Documento) {
  const generado = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' });
  const { start, count } = doc.bufferedPageRange();
  for (let i = start; i < start + count; i += 1) {
    doc.switchToPage(i);
    const margenes = doc.page.margins;
    const abajo = margenes.bottom;
    margenes.bottom = 0;
    const ancho = doc.page.width - MARGEN * 2;
    doc.font('Helvetica').fontSize(7).fillColor(COLOR.tenue);
    doc.text(`Página ${i + 1} de ${count}`, MARGEN, MARGEN, { width: ancho, align: 'right', lineBreak: false });
    doc.text(`Horario generado el ${generado} · Klassy`, MARGEN, doc.page.height - MARGEN + 10, { width: ancho, lineBreak: false });
    margenes.bottom = abajo;
  }
}

function encabezado(doc: Documento, contexto: ContextoHoja, titulo: string): number {
  const ancho = doc.page.width - MARGEN * 2;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR.cuerpo).text(contexto.institucion, MARGEN, MARGEN, { width: ancho - 80, lineBreak: false, ellipsis: true });
  doc.font('Helvetica-Bold').fontSize(16).fillColor(COLOR.ink).text(titulo, MARGEN, MARGEN + 14, { width: ancho, lineBreak: false, ellipsis: true });
  doc.font('Helvetica').fontSize(9).fillColor(COLOR.tenue).text(contexto.subtitulo, MARGEN, MARGEN + 34, { width: ancho, lineBreak: false, ellipsis: true });
  return MARGEN + 52;
}

/** Acorta el texto con «…» hasta que quepa en `ancho` con la fuente que esté puesta. */
function recortar(doc: Documento, texto: string, ancho: number): string {
  if (doc.widthOfString(texto) <= ancho) return texto;
  let corto = texto;
  while (corto.length > 1 && doc.widthOfString(`${corto}…`) > ancho) corto = corto.slice(0, -1);
  return `${corto.trimEnd()}…`;
}

// ------------------------------------------------------------------ malla de un grupo o docente

/** Una página: periodos en filas, días en columnas; los bloques de varias horas ocupan una sola caja alta. */
function paginaMalla(doc: Documento, detalle: Detalle, sesiones: Sesion[], secundario: (s: Sesion) => string, n: Nombres, y0: number) {
  const { estructura } = detalle;
  const anchoPeriodo = 78;
  const anchoDia = (doc.page.width - MARGEN * 2 - anchoPeriodo) / Math.max(1, estructura.dias.length);
  const altoCabecera = 18;
  const altoDescanso = 12;
  const descansos = estructura.periodos.filter((p) => p.descanso_antes).length;
  const disponible = doc.page.height - y0 - MARGEN - altoCabecera - descansos * altoDescanso;
  const altoFila = Math.min(70, disponible / Math.max(1, estructura.periodos.length));

  // Posición vertical de cada periodo (contando los descansos intercalados).
  const yPeriodo: number[] = [];
  let y = y0 + altoCabecera;
  estructura.periodos.forEach((p) => {
    if (p.descanso_antes) {
      doc.rect(MARGEN, y, doc.page.width - MARGEN * 2, altoDescanso).fill(COLOR.suave);
      doc.font('Helvetica').fontSize(7).fillColor(COLOR.tenue).text('Descanso', MARGEN, y + 3, { width: doc.page.width - MARGEN * 2, align: 'center' });
      y += altoDescanso;
    }
    yPeriodo.push(y);
    y += altoFila;
  });

  doc.rect(MARGEN, y0, doc.page.width - MARGEN * 2, altoCabecera).fill(COLOR.primarioSuave);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR.primario).text('Periodo', MARGEN + 6, y0 + 5, { width: anchoPeriodo - 8 });
  estructura.dias.forEach((d, i) => {
    doc.text(DIAS[d] ?? '', MARGEN + anchoPeriodo + i * anchoDia + 6, y0 + 5, { width: anchoDia - 8 });
  });

  estructura.periodos.forEach((p, i) => {
    const yy = yPeriodo[i]!;
    doc.moveTo(MARGEN, yy).lineTo(doc.page.width - MARGEN, yy).lineWidth(0.5).strokeColor(COLOR.borde).stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR.ink).text(p.nombre, MARGEN + 6, yy + 4, { width: anchoPeriodo - 8, lineBreak: false });
    doc.font('Helvetica').fontSize(7).fillColor(COLOR.tenue).text(`${p.hora_inicio} – ${p.hora_fin}`, MARGEN + 6, yy + 15, { width: anchoPeriodo - 8, lineBreak: false });
  });

  for (const s of sesiones) {
    const col = estructura.dias.indexOf(s.dia);
    const ultimo = s.periodo + s.duracion - 1;
    if (col < 0 || yPeriodo[s.periodo] === undefined || yPeriodo[ultimo] === undefined) continue;
    const x = MARGEN + anchoPeriodo + col * anchoDia + 2;
    const yy = yPeriodo[s.periodo]! + 2;
    const alto = yPeriodo[ultimo]! + altoFila - yy - 2;
    const color = n.color(s);
    doc.lineWidth(0.6).roundedRect(x, yy, anchoDia - 4, alto, 3).fillAndStroke(color.fondo, color.borde);
    const texto = [secundario(s), n.espacio(s.espacio_id)].filter(Boolean).join(' · ');
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR.ink).text(n.titulo(s), x + 4, yy + 3, { width: anchoDia - 12, height: 11, ellipsis: true });
    doc.font('Helvetica').fontSize(7).fillColor(COLOR.cuerpo).text(texto, x + 4, yy + 14, { width: anchoDia - 12, height: Math.max(9, alto - 16), ellipsis: true });
  }
}

/** Una página por grupo o docente. Si `primeraAbierta`, la primera usa la página que quien llama ya abrió (para colgarle el marcador que las agrupa). */
function paginasDeEntidades(
  doc: Documento,
  detalle: Detalle,
  vista: 'GRUPO' | 'DOCENTE',
  entidades: Array<{ id: string; nombre: string }>,
  contexto: ContextoHoja,
  n: Nombres,
  marcadorPadre: Marcador | null,
  primeraAbierta = false
) {
  entidades.forEach((e, i) => {
    if (i > 0 || !primeraAbierta) nuevaPagina(doc);
    marcar(marcadorPadre, doc, e.nombre);
    const propias = detalle.horario.sesiones.filter((s) => (vista === 'GRUPO' ? String(s.group_id) === e.id : s.docente_ids.some((d) => String(d) === e.id)));
    const y0 = encabezado(doc, contexto, `Horario · ${e.nombre}`);
    paginaMalla(doc, detalle, propias, vista === 'GRUPO' ? (s) => n.docentes(s) : (s) => n.grupo(s.group_id) || 'Sin grupo', n, y0);
  });
}

// ------------------------------------------------------------------ hojas totales

interface FilaTotal {
  etiqueta: string;
  sesiones: Sesion[];
}

interface OpcionesTotal {
  titulo: string;
  columna: string;
  anchoEtiqueta: number;
  /** Lo que se escribe en la celda de una sesión: el dato principal en negrita y, debajo, uno pequeño. */
  celda: (s: Sesion) => { principal: string; secundario: string };
}

const ALTO_FILA_IDEAL = 40;
const ALTO_FILA_MINIMO = 24;
const ALTO_CABECERA_TOTAL = 30;
const ALTO_LINEA_LEYENDA = 12;

/** Una ficha de color por asignatura que aparece en la hoja: la abreviatura de la celda dice «MAT» y aquí se lee «Matemáticas». */
function leyendaDeAsignaturas(doc: Documento, detalle: Detalle, sesiones: readonly Sesion[]) {
  const usadas = new Set(sesiones.flatMap((s) => (s.subject_id ? [String(s.subject_id)] : [])));
  const items = detalle.catalogo.asignaturas
    .filter((a) => usadas.has(a._id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((a) => ({ texto: `${a.abreviatura} = ${a.nombre}`, color: a.color }));
  const ancho = doc.page.width - MARGEN * 2;
  doc.font('Helvetica').fontSize(7);
  const medida = (texto: string) => 12 + doc.widthOfString(texto) + 12;

  const renglones: Array<typeof items> = [[]];
  let usado = 0;
  for (const item of items) {
    if (usado + medida(item.texto) > ancho && renglones[renglones.length - 1]!.length > 0) {
      renglones.push([]);
      usado = 0;
    }
    renglones[renglones.length - 1]!.push(item);
    usado += medida(item.texto);
  }
  const alto = items.length === 0 ? 0 : renglones.length * ALTO_LINEA_LEYENDA + 4;
  const dibujar = (yInicio: number) => {
    renglones.forEach((fila, r) => {
      let x = MARGEN;
      const y = yInicio + r * ALTO_LINEA_LEYENDA;
      for (const item of fila) {
        doc.lineWidth(0.5).roundedRect(x, y + 1, 8, 8, 2).fillAndStroke(item.color.fondo, item.color.borde);
        doc.font('Helvetica').fontSize(7).fillColor(COLOR.cuerpo).text(item.texto, x + 11, y + 2, { lineBreak: false });
        x += medida(item.texto);
      }
    });
  };
  return { alto, dibujar };
}

/**
 * Hoja total (como el «horario total» de los programas de horarios): una fila por grupo o por docente y, en columnas, cada
 * día con sus periodos. La primera página ya debe estar abierta (en A3). Cada clase es una celda de su color; un bloque de varias horas ocupa varias columnas. Si las filas no
 * caben en una página se reparten parejo en las que hagan falta y cada una repite el encabezado.
 */
function paginasTotal(doc: Documento, detalle: Detalle, filas: FilaTotal[], opciones: OpcionesTotal, contexto: ContextoHoja, n: Nombres) {
  const { estructura } = detalle;
  const nPeriodos = estructura.periodos.length;
  const nColumnas = estructura.dias.length * nPeriodos;
  const leyenda = leyendaDeAsignaturas(doc, detalle, filas.flatMap((f) => f.sesiones));

  const ancho = doc.page.width - MARGEN * 2;
  const anchoCelda = (ancho - opciones.anchoEtiqueta) / Math.max(1, nColumnas);
  const y0 = MARGEN + 52;
  const disponible = doc.page.height - MARGEN - leyenda.alto - (y0 + ALTO_CABECERA_TOTAL);
  const porPaginaMaximo = Math.max(1, Math.floor(disponible / ALTO_FILA_MINIMO));
  const paginas = Math.max(1, Math.ceil(filas.length / porPaginaMaximo));
  const porPagina = Math.max(1, Math.ceil(filas.length / paginas));
  const altoFila = Math.min(ALTO_FILA_IDEAL, disponible / porPagina);
  const x0 = MARGEN + opciones.anchoEtiqueta;

  for (let pagina = 0; pagina < paginas; pagina += 1) {
    if (pagina > 0) nuevaPagina(doc, true);
    encabezado(doc, contexto, opciones.titulo);
    const delaPagina = filas.slice(pagina * porPagina, (pagina + 1) * porPagina);
    const yFilas = y0 + ALTO_CABECERA_TOTAL;
    const yFin = yFilas + delaPagina.length * altoFila;

    // Cabecera: día arriba; abajo, el número del periodo y su hora de inicio.
    doc.rect(MARGEN, y0, ancho, ALTO_CABECERA_TOTAL).fill(COLOR.primarioSuave);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR.primario).text(opciones.columna, MARGEN + 6, y0 + 11, { width: opciones.anchoEtiqueta - 8, lineBreak: false });
    estructura.dias.forEach((d, i) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR.primario).text(DIAS[d] ?? '', x0 + i * nPeriodos * anchoCelda, y0 + 3, { width: nPeriodos * anchoCelda, align: 'center', lineBreak: false });
      estructura.periodos.forEach((p, k) => {
        const x = x0 + (i * nPeriodos + k) * anchoCelda;
        doc.font('Helvetica-Bold').fontSize(7).fillColor(COLOR.ink).text(String(k + 1), x, y0 + 14, { width: anchoCelda, align: 'center', lineBreak: false });
        doc.font('Helvetica').fontSize(5).fillColor(COLOR.tenue).text(p.hora_inicio, x, y0 + 23, { width: anchoCelda, align: 'center', lineBreak: false });
      });
    });

    // Filas y rejilla: línea fuerte entre días y media entre antes y después del descanso.
    delaPagina.forEach((fila, r) => {
      const y = yFilas + r * altoFila;
      doc.moveTo(MARGEN, y).lineTo(MARGEN + ancho, y).lineWidth(0.4).strokeColor(COLOR.borde).stroke();
      doc.font('Helvetica-Bold').fontSize(fila.etiqueta.length > 12 ? 7 : 9).fillColor(COLOR.ink);
      doc.text(fila.etiqueta, MARGEN + 6, y + altoFila / 2 - 5, { width: opciones.anchoEtiqueta - 10, height: 12, ellipsis: true });
    });
    doc.moveTo(MARGEN, yFin).lineTo(MARGEN + ancho, yFin).lineWidth(0.4).strokeColor(COLOR.borde).stroke();
    doc.moveTo(x0, y0).lineTo(x0, yFin).lineWidth(0.8).strokeColor(COLOR.tenue).stroke();
    estructura.dias.forEach((_, i) => {
      for (let k = 0; k < nPeriodos; k += 1) {
        const x = x0 + (i * nPeriodos + k) * anchoCelda;
        if (k === 0) doc.moveTo(x, y0).lineTo(x, yFin).lineWidth(0.8).strokeColor(COLOR.tenue).stroke();
        else if (estructura.periodos[k]!.descanso_antes) doc.moveTo(x, yFilas).lineTo(x, yFin).lineWidth(1.4).strokeColor(COLOR.borde).stroke();
      }
    });
    doc.moveTo(x0 + nColumnas * anchoCelda, y0).lineTo(x0 + nColumnas * anchoCelda, yFin).lineWidth(0.8).strokeColor(COLOR.tenue).stroke();

    delaPagina.forEach((fila, r) => {
      const yFila = yFilas + r * altoFila;
      for (const s of fila.sesiones) {
        const dia = estructura.dias.indexOf(s.dia);
        if (dia < 0) continue;
        const x = x0 + (dia * nPeriodos + s.periodo) * anchoCelda + 1;
        const w = s.duracion * anchoCelda - 2;
        const color = n.color(s);
        doc.lineWidth(0.5).roundedRect(x, yFila + 1.5, w, altoFila - 3, 2).fillAndStroke(color.fondo, color.borde);
        const { principal, secundario } = opciones.celda(s);
        const alto2 = altoFila >= 32 ? 2 : 1;
        const alto = 9 + alto2 * 6.5;
        const yTexto = yFila + (altoFila - alto) / 2;
        doc.font('Helvetica-Bold').fontSize(8);
        doc.fillColor(COLOR.ink).text(recortar(doc, principal, w - 4), x + 2, yTexto, { width: w - 4, align: 'center', lineBreak: false });
        doc.font('Helvetica').fontSize(5.5).fillColor(COLOR.cuerpo);
        doc.text(secundario, x + 2, yTexto + 9, { width: w - 4, height: alto2 * 6.5, align: 'center', ellipsis: true });
      }
    });

    leyenda.dibujar(doc.page.height - MARGEN - leyenda.alto + 2);
  }
}

function totalGrupos(doc: Documento, detalle: Detalle, contexto: ContextoHoja, n: Nombres, marcadorPadre: Marcador | null, primeraAbierta = false) {
  if (!primeraAbierta) nuevaPagina(doc, true);
  marcar(marcadorPadre, doc, 'Horario total de las clases');
  const filas = detalle.catalogo.grupos.map((g) => ({
    etiqueta: g.etiqueta_corta || g.etiqueta,
    sesiones: detalle.horario.sesiones.filter((s) => String(s.group_id) === g._id),
  }));
  paginasTotal(doc, detalle, filas, { titulo: 'Horario total de las clases', columna: 'Grupo', anchoEtiqueta: 46, celda: (s) => ({ principal: n.corto(s), secundario: n.docentesCortos(s) }) }, contexto, n);
}

function totalDocentes(doc: Documento, detalle: Detalle, contexto: ContextoHoja, n: Nombres, marcadorPadre: Marcador | null) {
  nuevaPagina(doc, true);
  marcar(marcadorPadre, doc, 'Horario total de los docentes');
  const filas = detalle.catalogo.docentes.map((d) => ({
    etiqueta: d.nombre,
    sesiones: detalle.horario.sesiones.filter((s) => s.docente_ids.some((x) => String(x) === d._id)),
  }));
  paginasTotal(
    doc,
    detalle,
    filas,
    {
      titulo: 'Horario total de los docentes',
      columna: 'Docente',
      anchoEtiqueta: 120,
      celda: (s) => (s.group_id ? { principal: n.grupoCorto(s.group_id), secundario: n.corto(s) } : { principal: 'Reun.', secundario: n.titulo(s) }),
    },
    contexto,
    n
  );
}

/**
 * Todo lo de una jornada en orden de lectura: la hoja total de grupos y la de docentes, luego cada docente y cada grupo. Con
 * `tituloJornada` (el PDF de toda la sede) el índice del visor agrupa todo bajo esa jornada.
 */
function jornadaCompleta(doc: Documento, detalle: Detalle, contexto: ContextoHoja, n: Nombres, tituloJornada: string | null) {
  nuevaPagina(doc, true);
  const raiz = tituloJornada ? marcar(null, doc, tituloJornada) : null;
  totalGrupos(doc, detalle, contexto, n, raiz, true);
  totalDocentes(doc, detalle, contexto, n, raiz);

  const docentes = detalle.catalogo.docentes.map((d) => ({ id: d._id, nombre: d.nombre }));
  if (docentes.length > 0) {
    nuevaPagina(doc);
    paginasDeEntidades(doc, detalle, 'DOCENTE', docentes, contexto, n, marcar(raiz, doc, 'Cada docente'), true);
  }
  const grupos = detalle.catalogo.grupos.map((g) => ({ id: g._id, nombre: g.etiqueta }));
  if (grupos.length > 0) {
    nuevaPagina(doc);
    paginasDeEntidades(doc, detalle, 'GRUPO', grupos, contexto, n, marcar(raiz, doc, 'Cada grupo'), true);
  }
}

function subtituloDe(anio: string | undefined, jornada: { nombre: string } | null | undefined, version: string) {
  return [anio, jornada ? `Jornada ${JORNADAS[jornada.nombre] ?? jornada.nombre}` : null, version].filter(Boolean).join(' · ');
}

const sinTildes = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Dibuja una versión (pura: no toca la base). GRUPO o DOCENTE con `entidadId` (una página) o sin él (una por cada grupo o docente),
 * GENERAL (la hoja total de docentes), TOTAL_GRUPOS (la de grupos) y COMPLETO (las dos hojas y cada docente y grupo).
 */
export async function renderizarHorario(detalle: DetalleParaPdf, contexto: ContextoHoja, vista: VistaPdfHorario, entidadId?: string) {
  const n = nombres(detalle);
  const { doc, listo } = crearDocumento();
  let sufijo = '';

  if (vista === 'GENERAL') {
    totalDocentes(doc, detalle, contexto, n, null);
    sufijo = '-docentes-total';
  } else if (vista === 'TOTAL_GRUPOS') {
    totalGrupos(doc, detalle, contexto, n, null);
    sufijo = '-grupos-total';
  } else if (vista === 'COMPLETO') {
    jornadaCompleta(doc, detalle, contexto, n, null);
    sufijo = '-completo';
  } else {
    const entidades =
      vista === 'GRUPO'
        ? detalle.catalogo.grupos.map((g) => ({ id: g._id, nombre: g.etiqueta }))
        : detalle.catalogo.docentes.map((d) => ({ id: d._id, nombre: d.nombre }));
    const elegidas = entidadId ? entidades.filter((e) => e.id === entidadId) : entidades;
    if (elegidas.length === 0) throw new ApiError(404, vista === 'GRUPO' ? 'Ese grupo no tiene clases en esta versión.' : 'Ese docente no tiene clases en esta versión.');
    paginasDeEntidades(doc, detalle, vista, elegidas, contexto, n, null);
    sufijo = entidadId ? `-${sinTildes(elegidas[0]?.nombre ?? '')}` : vista === 'GRUPO' ? '-grupos' : '-docentes';
  }

  pieDePaginas(doc);
  doc.end();
  return { buffer: await listo, sufijo };
}

/**
 * Dibuja los horarios publicados de varias jornadas en un solo documento (pura): por cada una, las dos hojas totales y una página
 * por docente y por grupo, agrupadas en el índice del visor bajo el nombre de la jornada. Las asignaturas toman el mismo color en
 * todas las jornadas.
 */
export async function renderizarHorariosDeSede(jornadas: Array<{ detalle: DetalleParaPdf; contexto: ContextoHoja; titulo: string }>) {
  const colores = asignarColoresAsignaturas(jornadas.flatMap(({ detalle }) => detalle.catalogo.asignaturas.map((a) => a._id)));
  for (const { detalle } of jornadas) for (const a of detalle.catalogo.asignaturas) a.color = colores.get(a._id) ?? a.color;

  const { doc, listo } = crearDocumento();
  for (const { detalle, contexto, titulo } of jornadas) jornadaCompleta(doc, detalle, contexto, nombres(detalle), titulo);
  pieDePaginas(doc);
  doc.end();
  return listo;
}

/** PDF de una versión de horario; ver `renderizarHorario` para las vistas. */
export async function generarPdfHorario(id: string, vista: VistaPdfHorario, entidadId: string | undefined, usuario: Usuario) {
  const registro = await Horario.findById(id).select('estado academic_year_id jornada_id nombre version');
  if (!registro) throw new ApiError(404, 'Horario no encontrado.');
  if (registro.estado === 'GENERANDO' || registro.estado === 'FALLIDO') throw new ApiError(409, 'Esta versión no tiene un horario para imprimir.');
  await exigirPermiso(usuario, registro, vista, entidadId);

  const [detalle, institucion, anio, jornada] = await Promise.all([
    obtenerHorario(id),
    Institution.findOne().select('nombre').lean(),
    AcademicYear.findById(registro.academic_year_id).select('nombre').lean(),
    JornadaOperativa.findById(registro.jornada_id).select('nombre').lean(),
  ]);
  const estado = registro.estado === 'PUBLICADO' ? 'Publicado' : registro.estado === 'BORRADOR' ? 'Borrador' : 'Archivado';
  const contexto: ContextoHoja = { institucion: institucion?.nombre ?? '', subtitulo: subtituloDe(anio?.nombre, jornada, `${registro.nombre} (${estado})`) };
  const { buffer, sufijo } = await renderizarHorario(detalle, contexto, vista, entidadId);
  return { buffer, nombreArchivo: `horario-${registro.version}${sufijo}.pdf` };
}

/**
 * Un solo PDF con los horarios publicados de toda la sede en el año: por cada jornada, la hoja total de grupos, la de docentes,
 * una página por docente y una por grupo. Solo gestión (ADMIN y COORDINADOR).
 */
export async function generarPdfSede(academicYearId: string, sedeId: string, usuario: Usuario) {
  if (usuario.rol !== 'ADMIN' && usuario.rol !== 'COORDINADOR') throw new ApiError(403, 'No tienes permiso para descargar los horarios de la sede.');
  const [anio, sede, institucion, jornadas] = await Promise.all([
    AcademicYear.findById(academicYearId).select('nombre').lean(),
    Campus.findById(sedeId).select('nombre').lean(),
    Institution.findOne().select('nombre').lean(),
    JornadaOperativa.find({ sede_id: sedeId }).select('nombre hora_inicio').sort({ hora_inicio: 1 }).lean(),
  ]);
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  if (!sede) throw new ApiError(404, 'Sede no encontrada.');

  const publicados = await Horario.find({ academic_year_id: academicYearId, jornada_id: { $in: jornadas.map((j) => j._id) }, estado: 'PUBLICADO' })
    .select('_id jornada_id version nombre')
    .lean();
  const porJornada = jornadas.flatMap((j) => {
    const horario = publicados.find((h) => String(h.jornada_id) === String(j._id));
    return horario ? [{ jornada: j, horario }] : [];
  });
  if (porJornada.length === 0) throw new ApiError(409, 'Esta sede no tiene horarios publicados en el año lectivo. Publica el de cada jornada para descargar el de la sede.');

  const detalles = await Promise.all(porJornada.map(({ horario }) => obtenerHorario(String(horario._id))));
  const buffer = await renderizarHorariosDeSede(
    detalles.map((detalle, i) => {
      const { jornada, horario } = porJornada[i]!;
      const titulo = `Jornada ${JORNADAS[jornada.nombre] ?? jornada.nombre}`;
      return {
        detalle,
        titulo,
        contexto: { institucion: institucion?.nombre ?? '', subtitulo: [anio.nombre, sede.nombre, titulo, `${horario.nombre} (Publicado)`].join(' · ') },
      };
    })
  );
  return { buffer, nombreArchivo: `horarios-${sinTildes(sede.nombre)}-${sinTildes(anio.nombre)}.pdf` };
}
