import PDFDocument from 'pdfkit';
import { NOMBRES_DOCUMENTO_MATRICULA } from '../constants/matriculaChecklist';
import { EnrollmentDocument } from '../models/enrollment.model';
import Guardian from '../models/guardian.model';
import StudentGuardian from '../models/studentGuardian.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { buscarInstitucion } from './institution.service';

/**
 * Genera el Acta de Compromiso Digital (M04-C): comprobante en PDF con los
 * documentos pendientes/rechazados y la fecha limite acordada con el
 * acudiente, para una matricula MATRICULADO_CONDICIONAL.
 */
export async function generarActaCompromisoPdf(enrollment: EnrollmentDocument): Promise<Buffer> {
  if (enrollment.estado !== 'MATRICULADO_CONDICIONAL') {
    throw new ApiError(400, 'El acta de compromiso solo aplica a matrículas MATRICULADO_CONDICIONAL.');
  }

  const student = enrollment.student_id as unknown as UserDocument;
  const institucion = await buscarInstitucion();

  const vinculo = await StudentGuardian.findOne({ student_id: student._id, es_principal: true }).populate('guardian_id');
  const acudiente = vinculo?.guardian_id as unknown as InstanceType<typeof Guardian> | undefined;

  const pendientes = enrollment.checklist.filter((c) => c.estado !== 'APROBADO');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text(institucion?.nombre ?? 'Institución Educativa', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).text('Acta de Compromiso — Matrícula Condicional', { align: 'center' });
    doc.moveDown(1.5);

    doc.fontSize(11);
    doc.text(`Folio de matrícula: ${enrollment.folio_matricula ?? 'pendiente de asignar'}`);
    doc.text(`Estudiante: ${student.nombre} ${student.apellido}`);
    doc.text(`Documento: ${student.tipo_documento} ${student.numero_documento}`);
    if (acudiente) {
      doc.text(`Acudiente responsable: ${acudiente.nombre} ${acudiente.apellido} — Tel: ${acudiente.telefono_principal}`);
    }
    doc.moveDown(1);

    doc.fontSize(12).text('Documentos pendientes por entregar:', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    if (pendientes.length === 0) {
      doc.text('— Ninguno —');
    } else {
      pendientes.forEach((c) => {
        const estado = c.estado === 'RECHAZADO' ? ` (rechazado: ${c.comentario ?? 'sin comentario'})` : '';
        doc.text(`• ${NOMBRES_DOCUMENTO_MATRICULA[c.tipo_documento]}${estado}`);
      });
    }

    doc.moveDown(1.5);
    const fechaLimite = enrollment.fecha_limite_compromiso
      ? new Date(enrollment.fecha_limite_compromiso).toLocaleDateString('es-CO')
      : 'por definir';
    doc.fontSize(11).text(
      `El derecho al estudio es fundamental. Esta institución recibe la matrícula del estudiante de forma condicional, ` +
        `comprometiéndose el acudiente a entregar los documentos pendientes a más tardar el ${fechaLimite}. ` +
        `Pasada esta fecha sin la documentación completa, la Secretaría Académica podrá revisar la continuidad de la matrícula.`,
      { align: 'justify' }
    );

    doc.moveDown(3);
    doc.text('_____________________________', { align: 'left' });
    doc.text('Firma del acudiente', { align: 'left' });
    doc.moveDown(2);
    doc.text('_____________________________', { align: 'left' });
    doc.text('Firma de Secretaría Académica', { align: 'left' });

    doc.end();
  });
}
