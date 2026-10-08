import { Types } from 'mongoose';
import PDFDocument from 'pdfkit';
import { Rol } from '../constants/enums';
import AcademicYear from '../models/academicYear.model';
import Horario from '../models/horario.model';
import Institution from '../models/institution.model';
import JornadaOperativa from '../models/jornadaOperativa.model';
import ApiError from '../utils/ApiError';
import { gruposDelUsuario, obtenerHorario } from './horario.service';

export type VistaPdfHorario = 'GRUPO' | 'DOCENTE' | 'GENERAL';

// Los mismos tonos de la guía visual (Klassy UI Spec) que usan los PDF de asistencia.
const COLOR = {
  ink: '#172235',
  cuerpo: '#3F4D61',
  tenue: '#788794',
  borde: '#DDE4EC',
  primario: '#2878EA',
  primarioSuave: '#EAF3FF',
  alertaSuave: '#FFF5E6',
  suave: '#F1F5F9',
};
const MARGEN = 30;
const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const JORNADAS: Record<string, string> = { MANANA: 'Mañana', TARDE: 'Tarde', UNICA: 'Única', NOCTURNA: 'Nocturna', SABATINA: 'Sabatina' };

type Documento = InstanceType<typeof PDFDocument>;
type Detalle = Awaited<ReturnType<typeof obtenerHorario>>;
type Sesion = Detalle['horario']['sesiones'][number];

interface Usuario {
  _id: Types.ObjectId;
  rol: Rol;
}

/**
 * Quién puede bajar qué: ADMIN y COORDINADOR, cualquier vista de cualquier versión. El resto, solo versiones publicadas y
 * solo lo suyo: el docente su horario; el estudiante y el acudiente, el de su(s) grupo(s). La sábana general es de gestión.
 */
async function exigirPermiso(usuario: Usuario, horario: { estado: string; academic_year_id: Types.ObjectId }, vista: VistaPdfHorario, entidadId?: string) {
  if (usuario.rol === 'ADMIN' || usuario.rol === 'COORDINADOR') return;
  const negar = () => {
    throw new ApiError(403, 'No tienes permiso para descargar este horario.');
  };
  if (horario.estado !== 'PUBLICADO' || vista === 'GENERAL' || !entidadId) return negar();
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
  const docente = new Map(catalogo.docentes.map((d) => [d._id, d.nombre]));
  const espacio = new Map(catalogo.espacios.map((e) => [e._id, e.nombre]));
  const reunion = new Map(catalogo.reuniones.map((r) => [r._id, r.nombre]));
  return {
    titulo: (s: Sesion) => (s.subject_id ? (asignatura.get(String(s.subject_id))?.nombre ?? '') : (reunion.get(String(s.reunion_variable_id)) ?? 'Reunión')),
    corto: (s: Sesion) => (s.subject_id ? (asignatura.get(String(s.subject_id))?.abreviatura ?? '') : 'Reun.'),
    grupo: (id: Types.ObjectId | null) => (id ? (grupo.get(String(id))?.etiqueta ?? '') : ''),
    grupoCorto: (id: Types.ObjectId | null) => (id ? (grupo.get(String(id))?.etiqueta_corta ?? '') : ''),
    docentes: (s: Sesion) => s.docente_ids.map((d) => docente.get(String(d)) ?? '').join(', '),
    espacio: (id: Types.ObjectId | null) => (id ? (espacio.get(String(id)) ?? '') : ''),
  };
}

function encabezado(doc: Documento, institucion: string, titulo: string, subtitulo: string): number {
  const ancho = doc.page.width - MARGEN * 2;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR.cuerpo).text(institucion, MARGEN, MARGEN, { width: ancho, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(16).fillColor(COLOR.ink).text(titulo, MARGEN, MARGEN + 14, { width: ancho, lineBreak: false });
  doc.font('Helvetica').fontSize(9).fillColor(COLOR.tenue).text(subtitulo, MARGEN, MARGEN + 34, { width: ancho, lineBreak: false });
  return MARGEN + 52;
}

/** Una página: periodos en filas, días en columnas; los bloques de varias horas ocupan una sola caja alta. */
function paginaMalla(doc: Documento, detalle: Detalle, sesiones: Sesion[], secundario: (s: Sesion) => string, n: ReturnType<typeof nombres>, y0: number) {
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
    doc.roundedRect(x, yy, anchoDia - 4, alto, 3).fill(s.subject_id ? COLOR.primarioSuave : COLOR.alertaSuave);
    const texto = [secundario(s), n.espacio(s.espacio_id)].filter(Boolean).join(' · ');
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR.ink).text(n.titulo(s), x + 4, yy + 3, { width: anchoDia - 12, height: 11, ellipsis: true });
    doc.font('Helvetica').fontSize(7).fillColor(COLOR.cuerpo).text(texto, x + 4, yy + 14, { width: anchoDia - 12, height: Math.max(9, alto - 16), ellipsis: true });
  }
}

/** La "sábana": un docente por fila, cada día × periodo en columnas, con el grupo que atiende. Pagina si no cabe. */
function paginasSabana(doc: Documento, detalle: Detalle, n: ReturnType<typeof nombres>, encabezar: () => number) {
  const { estructura, catalogo, horario } = detalle;
  const columnas = estructura.dias.flatMap((d) => estructura.periodos.map((p, i) => ({ dia: d, periodo: i, descanso: p.descanso_antes })));
  const anchoNombre = 118;
  const anchoCelda = (doc.page.width - MARGEN * 2 - anchoNombre) / Math.max(1, columnas.length);
  const altoFila = 13;

  const ocupacion = new Map<string, Sesion[]>();
  for (const s of horario.sesiones) {
    for (const d of s.docente_ids) {
      for (let k = 0; k < s.duracion; k += 1) {
        const clave = `${String(d)}|${s.dia}|${s.periodo + k}`;
        ocupacion.set(clave, [...(ocupacion.get(clave) ?? []), s]);
      }
    }
  }

  const cabecera = (y: number) => {
    doc.rect(MARGEN, y, doc.page.width - MARGEN * 2, 24).fill(COLOR.primarioSuave);
    doc.font('Helvetica-Bold').fontSize(7).fillColor(COLOR.primario).text('Docente', MARGEN + 4, y + 8, { width: anchoNombre - 6 });
    estructura.dias.forEach((d, i) => {
      const x = MARGEN + anchoNombre + i * estructura.periodos.length * anchoCelda;
      doc.text(DIAS[d] ?? '', x, y + 3, { width: estructura.periodos.length * anchoCelda, align: 'center' });
    });
    columnas.forEach((c, i) => {
      doc.font('Helvetica').fontSize(6).fillColor(COLOR.tenue).text(String(c.periodo + 1), MARGEN + anchoNombre + i * anchoCelda, y + 14, { width: anchoCelda, align: 'center' });
    });
    return y + 24;
  };

  let y = cabecera(encabezar());
  for (const docente of catalogo.docentes) {
    if (y + altoFila > doc.page.height - MARGEN) {
      doc.addPage();
      y = cabecera(encabezar());
    }
    doc.moveTo(MARGEN, y).lineTo(doc.page.width - MARGEN, y).lineWidth(0.4).strokeColor(COLOR.borde).stroke();
    doc.font('Helvetica').fontSize(7).fillColor(COLOR.ink).text(docente.nombre, MARGEN + 4, y + 3, { width: anchoNombre - 6, height: altoFila, ellipsis: true, lineBreak: false });
    columnas.forEach((c, i) => {
      const x = MARGEN + anchoNombre + i * anchoCelda;
      if (c.periodo === 0 || c.descanso) {
        doc.moveTo(x, y).lineTo(x, y + altoFila).lineWidth(c.periodo === 0 ? 0.6 : 1.5).strokeColor(c.periodo === 0 ? COLOR.borde : COLOR.suave).stroke();
      }
      const aqui = ocupacion.get(`${docente._id}|${c.dia}|${c.periodo}`) ?? [];
      if (aqui.length === 0) return;
      doc.rect(x + 0.8, y + 1.5, anchoCelda - 1.6, altoFila - 3).fill(aqui.every((s) => !s.subject_id) ? COLOR.alertaSuave : COLOR.primarioSuave);
      const texto = aqui.map((s) => (s.group_id ? n.grupoCorto(s.group_id) : n.corto(s))).join('/');
      doc.font('Helvetica').fontSize(6).fillColor(COLOR.ink).text(texto, x, y + 4, { width: anchoCelda, align: 'center', lineBreak: false, ellipsis: true });
    });
    y += altoFila;
  }
}

/**
 * PDF de una versión: GRUPO o DOCENTE con `entidadId` (una página) o sin él (una página por cada grupo o docente), y
 * GENERAL (la sábana de todos los docentes).
 */
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
  const n = nombres(detalle);
  const estado = registro.estado === 'PUBLICADO' ? 'Publicado' : registro.estado === 'BORRADOR' ? 'Borrador' : 'Archivado';
  const subtitulo = [anio?.nombre, jornada ? `Jornada ${JORNADAS[jornada.nombre] ?? jornada.nombre}` : null, `${registro.nombre} (${estado})`]
    .filter(Boolean)
    .join(' · ');

  const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margins: { top: MARGEN, left: MARGEN, right: MARGEN, bottom: MARGEN } });
  const partes: Buffer[] = [];
  doc.on('data', (p: Buffer) => partes.push(p));
  const listo = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });

  const nombreInstitucion = institucion?.nombre ?? '';
  let nombreArchivo = `horario-${registro.version}`;

  if (vista === 'GENERAL') {
    paginasSabana(doc, detalle, n, () => encabezado(doc, nombreInstitucion, 'Horario general de docentes', subtitulo));
    nombreArchivo += '-general';
  } else {
    const entidades =
      vista === 'GRUPO'
        ? detalle.catalogo.grupos.map((g) => ({ id: g._id, nombre: g.etiqueta }))
        : detalle.catalogo.docentes.map((d) => ({ id: d._id, nombre: d.nombre }));
    const elegidas = entidadId ? entidades.filter((e) => e.id === entidadId) : entidades;
    if (elegidas.length === 0) throw new ApiError(404, vista === 'GRUPO' ? 'Ese grupo no tiene clases en esta versión.' : 'Ese docente no tiene clases en esta versión.');

    elegidas.forEach((e, i) => {
      if (i > 0) doc.addPage();
      const propias = detalle.horario.sesiones.filter((s) =>
        vista === 'GRUPO' ? String(s.group_id) === e.id : s.docente_ids.some((d) => String(d) === e.id)
      );
      const y0 = encabezado(doc, nombreInstitucion, `Horario · ${e.nombre}`, subtitulo);
      paginaMalla(doc, detalle, propias, vista === 'GRUPO' ? (s) => n.docentes(s) : (s) => n.grupo(s.group_id) || 'Sin grupo', n, y0);
    });
    nombreArchivo += entidadId ? `-${(elegidas[0]?.nombre ?? '').toLowerCase().replace(/[^a-z0-9]+/gi, '-')}` : vista === 'GRUPO' ? '-grupos' : '-docentes';
  }

  doc.end();
  return { buffer: await listo, nombreArchivo: `${nombreArchivo}.pdf` };
}
