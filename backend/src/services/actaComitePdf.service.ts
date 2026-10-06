import PDFDocument from 'pdfkit';
import { ROLES } from '../constants/roles';
import { MiembroComite } from '../models/comiteConvivencia.model';
import { User, UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { registrarEvento } from './audit.service';
import { COLOR, Documento, bufferDeDocumento } from '../utils/pdf';
import { obtenerSesion } from './comite.service';
import { buscarInstitucion } from './institution.service';

// Los mismos tonos de la guía visual, para que el papel se parezca a la pantalla.
const MARGEN = 50;

const formatoFecha = (fecha: Date) => fecha.toLocaleDateString('es-CO', { timeZone: 'UTC', day: '2-digit', month: 'long', year: 'numeric' });
const formatoFechaHora = (fecha: Date) => fecha.toLocaleString('es-CO', { timeZone: 'America/Bogota' });


function titulo(doc: Documento, texto: string) {
  doc.moveDown(0.8).font('Helvetica-Bold').fontSize(10).fillColor(COLOR.primario).text(texto.toUpperCase());
  doc.moveTo(MARGEN, doc.y + 1).lineTo(doc.page.width - MARGEN, doc.y + 1).strokeColor(COLOR.borde).lineWidth(0.7).stroke();
  doc.moveDown(0.4).font('Helvetica').fontSize(9.5).fillColor(COLOR.cuerpo);
}

/**
 * PDF del acta. Un borrador se imprime marcado como tal; uno firmado lleva su consecutivo, quién lo firmó y la huella que
 * permite verificar que no cambió. El caso se identifica solo por su código: el acta no repite datos de los menores.
 */
export async function generarPdfActa(id: string, usuario: UserDocument, ip?: string | null): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  if (usuario.rol !== ROLES.ADMIN && usuario.rol !== ROLES.COORDINADOR_CONVIVENCIA) throw new ApiError(403, 'Solo convivencia accede a las actas.');
  const sesion = await obtenerSesion(id, usuario);
  const institucion = (await buscarInstitucion())?.nombre ?? 'Institución Educativa';

  const miembros = await MiembroComite.find({ _id: { $in: sesion.casos_tratados.flatMap((c) => c.recusados_ids) } }).select('nombre');
  const nombreMiembro = new Map(miembros.map((m) => [String(m._id), m.nombre]));
  const autores = await User.find({ _id: { $in: [sesion.firma?.por, ...sesion.anexos.map((a) => a.por)].filter(Boolean) } }).select('nombre apellido');
  const nombreAutor = new Map(autores.map((u) => [String(u._id), `${u.nombre} ${u.apellido}`]));

  const doc = new PDFDocument({ size: 'LETTER', margins: { top: MARGEN, left: MARGEN, right: MARGEN, bottom: MARGEN }, bufferPages: true });
  const listo = bufferDeDocumento(doc);

  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.cuerpo).text(institucion);
  doc.font('Helvetica-Bold').fontSize(16).fillColor(COLOR.ink).text('Acta del Comité Escolar de Convivencia');
  doc.font('Helvetica-Bold').fontSize(11).fillColor(sesion.estado === 'FIRMADA' ? COLOR.primario : COLOR.peligro).text(
    sesion.estado === 'FIRMADA' ? `Acta ${sesion.codigo}` : sesion.estado === 'ANULADA' ? 'SESIÓN ANULADA' : 'BORRADOR: no tiene validez hasta que sea firmada'
  );
  doc.moveDown(0.4).font('Helvetica').fontSize(9.5).fillColor(COLOR.cuerpo);
  doc.text(`Sesión ${sesion.tipo === 'ORDINARIA' ? 'ordinaria' : 'extraordinaria'} · ${formatoFecha(sesion.fecha)}${sesion.hora ? ` · ${sesion.hora}` : ''}${sesion.lugar ? ` · ${sesion.lugar}` : ''}`);

  titulo(doc, 'Orden del día');
  doc.text(sesion.orden_del_dia.trim() || 'No se registró.');

  titulo(doc, 'Asistentes y quórum');
  for (const a of sesion.asistentes) {
    doc.text(`${a.asistio ? '[X]' : '[  ]'}  ${a.nombre} — ${a.cargo}${a.es_presidente ? ' (preside)' : ''}`);
  }
  doc.moveDown(0.3).font('Helvetica-Bold').text(
    `Quórum: ${sesion.quorum.presentes} de ${sesion.quorum.total_miembros} miembros (se requiere ${sesion.quorum.porcentaje_requerido}%): ${sesion.quorum.alcanzado ? 'hay quórum para deliberar' : 'sin quórum'}.`
  );
  doc.font('Helvetica');

  titulo(doc, 'Desarrollo');
  doc.text(sesion.desarrollo.trim() || 'No se registró.');

  titulo(doc, 'Casos tratados');
  if (sesion.casos_tratados.length === 0) doc.text('No se trataron casos.');
  for (const c of sesion.casos_tratados) {
    doc.font('Helvetica-Bold').text(`Caso ${c.codigo}`).font('Helvetica');
    if (c.recusados_ids.length > 0) {
      doc.fillColor(COLOR.tenue).text(`Apartados de la deliberación: ${c.recusados_ids.map((r) => nombreMiembro.get(String(r)) ?? 'miembro').join(', ')}.`).fillColor(COLOR.cuerpo);
    }
    doc.text(c.decisiones.trim() || 'Sin decisiones registradas.').moveDown(0.4);
  }

  if (sesion.anexos.length > 0) {
    titulo(doc, 'Anexos y correcciones posteriores a la firma');
    for (const a of sesion.anexos) {
      doc.fillColor(COLOR.tenue).text(`${formatoFechaHora(a.fecha)} · ${nombreAutor.get(String(a.por)) ?? ''}`).fillColor(COLOR.cuerpo).text(a.texto).moveDown(0.3);
    }
  }

  if (sesion.firma) {
    titulo(doc, 'Firma');
    doc.text(`Firmada electrónicamente por ${nombreAutor.get(String(sesion.firma.por)) ?? 'el rector'} el ${formatoFechaHora(sesion.firma.fecha)}.`);
    doc.font('Courier').fontSize(7.5).fillColor(COLOR.tenue).text(`Huella SHA-256: ${sesion.firma.hash}`);
  }

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

  await registrarEvento({ usuario_id: usuario._id, accion: 'ACTA_COMITE_PDF_GENERADO', entidad: 'SesionComite', entidad_id: sesion._id, detalle: sesion.codigo ?? sesion.estado, ip });
  return { buffer, nombreArchivo: `${sesion.codigo ?? 'borrador-acta'}.pdf` };
}
