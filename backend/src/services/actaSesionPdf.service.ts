import PDFDocument from 'pdfkit';
import { DecisionDeCaso, NOMBRES_INSTANCIA } from '../constants/comision';
import Institution from '../models/institution.model';
import User, { UserDocument } from '../models/user.model';
import { registrarEvento } from './audit.service';
import { obtenerSesion } from './sesionComision.service';

// Los mismos tonos de la guía visual, para que el papel se parezca a la pantalla.
const COLOR = { ink: '#172235', cuerpo: '#3F4D61', tenue: '#788794', borde: '#DDE4EC', primario: '#2878EA', peligro: '#EF5350' };
const MARGEN = 50;

const formatoFecha = (fecha: Date) => fecha.toLocaleDateString('es-CO', { timeZone: 'UTC', day: '2-digit', month: 'long', year: 'numeric' });
const formatoFechaHora = (fecha: Date) => fecha.toLocaleString('es-CO', { timeZone: 'America/Bogota' });

const NOMBRE_DECISION: Record<DecisionDeCaso, string> = {
  PROMOVER: 'Promover al grado siguiente',
  NO_PROMOVER: 'No promover',
  PROMOVER_CON_ARRASTRE: 'Promover con asignatura(s) pendiente(s)',
  ENVIAR_A_RECUPERACION: 'Enviar a recuperación',
  RECOMENDAR_ANTICIPADA: 'Recomendar la promoción anticipada',
  NO_RECOMENDAR_ANTICIPADA: 'No recomendar la promoción anticipada',
  APROBAR_ANTICIPADA: 'Aprobar la promoción anticipada',
  NO_APROBAR_ANTICIPADA: 'No aprobar la promoción anticipada',
};

const NOMBRE_TIPO_CASO = { PROMOCION: 'promoción', PROMOCION_ANTICIPADA: 'promoción anticipada', SEGUIMIENTO: 'seguimiento' } as const;

type Documento = InstanceType<typeof PDFDocument>;

function titulo(doc: Documento, texto: string) {
  doc.moveDown(0.8).font('Helvetica-Bold').fontSize(10).fillColor(COLOR.primario).text(texto.toUpperCase());
  doc.moveTo(MARGEN, doc.y + 1).lineTo(doc.page.width - MARGEN, doc.y + 1).strokeColor(COLOR.borde).lineWidth(0.7).stroke();
  doc.moveDown(0.4).font('Helvetica').fontSize(9.5).fillColor(COLOR.cuerpo);
}

/**
 * PDF del acta de una sesión de la comisión o de un consejo (M20), con el patrón del acta de convivencia (M15). Un borrador se imprime
 * marcado como tal; una firmada lleva su consecutivo, quién firmó y la huella SHA-256 que permite comprobar que no cambió.
 */
export async function generarPdfActaSesion(id: string, usuario: UserDocument): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const sesion = await obtenerSesion(id, usuario);
  const institucion = (await Institution.findOne())?.nombre ?? 'Institución Educativa';
  const estudiantes = await User.find({ _id: { $in: sesion.casos.map((c) => c.student_id) } }).select('nombre apellido numero_documento');
  const nombreEstudiante = new Map(estudiantes.map((e) => [String(e._id), `${e.apellido} ${e.nombre} (${e.numero_documento})`]));
  const nombreMiembro = new Map(sesion.miembros.map((m) => [String(m._id), m.nombre]));

  const doc = new PDFDocument({ size: 'LETTER', margins: { top: MARGEN, left: MARGEN, right: MARGEN, bottom: MARGEN }, bufferPages: true });
  const partes: Buffer[] = [];
  doc.on('data', (p: Buffer) => partes.push(p));
  const listo = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });

  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.cuerpo).text(institucion);
  doc.font('Helvetica-Bold').fontSize(16).fillColor(COLOR.ink).text(`Acta del ${NOMBRES_INSTANCIA[sesion.instancia]}`);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(sesion.estado === 'FIRMADA' ? COLOR.primario : COLOR.peligro).text(
    sesion.estado === 'FIRMADA' ? `Acta ${sesion.codigo}` : sesion.estado === 'ANULADA' ? 'SESIÓN ANULADA' : 'BORRADOR: no tiene validez hasta que sea firmada'
  );
  doc.moveDown(0.4).font('Helvetica').fontSize(9.5).fillColor(COLOR.cuerpo);
  doc.text(
    `Año lectivo ${sesion.anio} · ${sesion.alcance.periodo_numero ? `Periodo ${sesion.alcance.periodo_numero}` : 'Cierre anual'} · ${formatoFecha(sesion.fecha)}${sesion.hora ? ` · ${sesion.hora}` : ''}${sesion.lugar ? ` · ${sesion.lugar}` : ''}`
  );

  titulo(doc, 'Orden del día');
  doc.text(sesion.orden_del_dia.trim() || 'No se registró.');

  titulo(doc, 'Integrantes, asistencia y quórum');
  for (const m of sesion.miembros) {
    doc.text(`${m.asistio ? '[X]' : '[  ]'}  ${m.nombre} — ${m.cargo}${m.es_presidente ? ' (preside)' : ''}${m.user_id ? '' : ' · firma en papel'}`);
  }
  if (sesion.quorum) {
    doc.moveDown(0.3).font('Helvetica-Bold').text(
      `Quórum: ${sesion.quorum.presentes} de ${sesion.quorum.total_miembros} integrantes (se requiere ${sesion.quorum.porcentaje_requerido}%): ${sesion.quorum.alcanzado ? 'hay quórum para deliberar' : 'sin quórum'}.`
    );
  }
  doc.font('Helvetica');

  titulo(doc, 'Desarrollo');
  doc.text(sesion.desarrollo.trim() || 'No se registró.');

  titulo(doc, 'Casos tratados');
  if (sesion.casos.length === 0) doc.text('No se trataron casos.');
  for (const c of sesion.casos) {
    doc.font('Helvetica-Bold').text(`${nombreEstudiante.get(String(c.student_id)) ?? 'Estudiante'} — ${NOMBRE_TIPO_CASO[c.tipo]}`).font('Helvetica');
    if (c.recusados_ids.length > 0) {
      doc.fillColor(COLOR.tenue).text(`Apartados de la deliberación: ${c.recusados_ids.map((r) => nombreMiembro.get(String(r)) ?? 'integrante').join(', ')}.`).fillColor(COLOR.cuerpo);
    }
    doc.text(c.deliberacion.trim() || 'Sin deliberación registrada.');
    if (c.decision) {
      const v = c.resultado_votacion;
      doc.font('Helvetica-Bold').text(`Decisión: ${NOMBRE_DECISION[c.decision.tipo]}${v ? (v.aprobada ? ' — APROBADA' : ' — NO APROBADA (no se aplica)') : ''}`).font('Helvetica');
      if (c.decision.fundamento.trim()) doc.text(`Fundamento: ${c.decision.fundamento}`);
      if (v) doc.fillColor(COLOR.tenue).text(`Votos: ${v.a_favor} a favor, ${v.en_contra} en contra, ${v.abstenciones} abstenciones (habilitados: ${v.habilitados}).`).fillColor(COLOR.cuerpo);
    }
    doc.moveDown(0.4);
  }

  if (sesion.compromisos.length > 0) {
    titulo(doc, 'Compromisos');
    for (const k of sesion.compromisos) {
      doc.text(`• ${nombreEstudiante.get(String(k.student_id)) ?? 'Estudiante'}: ${k.descripcion} — responde ${k.responsable_nombre} (${k.responsable_tipo.toLowerCase()}), hasta el ${formatoFecha(k.fecha_limite)}.`);
    }
  }

  if (sesion.conclusiones.trim()) {
    titulo(doc, 'Conclusiones');
    doc.text(sesion.conclusiones);
  }

  titulo(doc, 'Firmas');
  for (const m of sesion.miembros.filter((x) => x.asistio)) {
    doc.text(m.firma ? `${m.nombre} — firmó con su contraseña el ${formatoFechaHora(m.firma.fecha)}` : `${m.nombre} — ${m.user_id ? 'pendiente de firma' : 'firma en papel: ______________________'}`);
  }
  if (sesion.hash) doc.moveDown(0.4).font('Courier').fontSize(7.5).fillColor(COLOR.tenue).text(`Huella SHA-256: ${sesion.hash}`);

  const { start, count } = doc.bufferedPageRange();
  for (let i = 0; i < count; i += 1) {
    doc.switchToPage(start + i);
    doc.font('Helvetica').fontSize(7).fillColor(COLOR.tenue).text(
      `Generado por ${usuario.nombre} ${usuario.apellido} el ${formatoFechaHora(new Date())} · Página ${i + 1} de ${count} · Documento confidencial`,
      MARGEN,
      doc.page.height - 36,
      { width: doc.page.width - MARGEN * 2, align: 'right', lineBreak: false }
    );
  }
  doc.end();
  const buffer = await listo;
  await registrarEvento({ usuario_id: usuario._id, accion: 'COMISION_SESION_PDF_GENERADO', entidad: 'SesionComision', entidad_id: sesion._id, detalle: sesion.codigo ?? sesion.estado });
  return { buffer, nombreArchivo: `${sesion.codigo ?? 'borrador-acta'}.pdf` };
}
