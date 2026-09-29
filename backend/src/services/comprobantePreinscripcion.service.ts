import PDFDocument from 'pdfkit';
import Institution from '../models/institution.model';
import ApiError from '../utils/ApiError';
import { buscarMatriculaDePreinscripcion, construirDetalle } from './preinscripcionPublica.service';

// Fechas de calendario (medianoche UTC): se muestran en UTC para no correrlas un dia en Colombia.
const formatoFecha = (fecha: Date): string =>
  new Date(fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const ETIQUETA_DOCUMENTO = {
  PENDIENTE: 'Pendiente de entregar',
  CARGADO: 'Cargado, en revisión',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado — debe reenviarse',
} as const;

/**
 * Comprobante de preinscripcion (M04): lo descarga el acudiente desde el sitio
 * publico. No lleva folio: el folio del Libro de Matricula se asigna al
 * legalizar la matricula, no al preinscribir.
 */
export async function generarComprobantePreinscripcionPdf(
  numeroDocumento: string,
  fechaNacimiento: string
): Promise<{ pdf: Buffer; codigo: string }> {
  const encontrada = await buscarMatriculaDePreinscripcion(numeroDocumento, fechaNacimiento);
  if (!encontrada) throw new ApiError(404, 'No encontramos una preinscripción aprobada con esos datos.');

  const { solicitud, enrollment } = encontrada;
  const detalle = construirDetalle(enrollment);
  const institucion = await Institution.findOne();
  const codigo = String(solicitud._id).slice(-8).toUpperCase();

  const pdf = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text(institucion?.nombre ?? 'Institución Educativa', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).text('Comprobante de Preinscripción', { align: 'center' });
    doc.moveDown(1.5);

    doc.fontSize(11);
    doc.text(`Código de preinscripción: ${codigo}`);
    doc.text(`Aspirante: ${solicitud.nombre_aspirante} ${solicitud.apellido_aspirante}`);
    doc.text(`Documento: ${solicitud.tipo_documento} ${solicitud.numero_documento}`);
    doc.text(`Acudiente: ${solicitud.acudiente_nombre} ${solicitud.acudiente_apellido}`);
    doc.moveDown(0.5);
    doc.text(`Grado asignado: ${detalle.grado} — Grupo ${detalle.grupo}`);
    doc.text(`Sede: ${detalle.sede} · Jornada: ${detalle.jornada}`);
    if (solicitud.fecha_revision) doc.text(`Preinscripción aprobada el: ${formatoFecha(solicitud.fecha_revision)}`);
    doc.text(
      `Fecha límite para legalizar la matrícula: ${
        detalle.fecha_limite_legalizacion ? formatoFecha(detalle.fecha_limite_legalizacion) : 'por definir'
      }`
    );
    doc.moveDown(1);

    doc.fontSize(12).text('Documentos requeridos para legalizar el cupo:', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    detalle.documentos.forEach((d) => {
      const extra = d.comentario ? ` (${d.comentario})` : '';
      doc.text(`• ${d.nombre}: ${ETIQUETA_DOCUMENTO[d.estado]}${extra}`);
    });

    doc.moveDown(1.5);
    doc.fontSize(10).text(
      'Este comprobante acredita la preinscripción y la reserva del cupo hasta la fecha límite indicada. ' +
        'El folio del Libro de Matrícula se asigna únicamente cuando la Secretaría Académica legaliza la matrícula ' +
        'con los documentos completos.',
      { align: 'justify' }
    );

    doc.end();
  });

  return { pdf, codigo };
}
