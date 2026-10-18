import PDFDocument from 'pdfkit';
import { TRATAMIENTOS_NOTAS } from '../constants/promocionAnticipada';
import Grade from '../models/grade.model';
import Institution from '../models/institution.model';
import PromocionAnticipada from '../models/promocionAnticipada.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { registrarEvento } from './audit.service';
import { exigirGestionDeTramites } from './promocionAnticipada.service';

const COLOR = { ink: '#172235', cuerpo: '#3F4D61', tenue: '#788794', borde: '#DDE4EC', primario: '#2878EA' };
const MARGEN = 60;

const formatoFecha = (fecha: Date) => fecha.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric' });

const DESCRIPCION_TRATAMIENTO: Record<(typeof TRATAMIENTOS_NOTAS)[number], string> = {
  NIVELACION: 'el estudiante presentará una nivelación en cada asignatura del grado nuevo por los periodos que no cursó',
  COPIAR_EQUIVALENTES: 'se copiará la nota de la asignatura equivalente del grado de origen; las asignaturas sin equivalente se nivelarán',
  DEJAR_SIN_NOTA: 'los periodos no cursados quedan sin nota y su porcentaje se reparte entre los periodos restantes del año',
};

/**
 * PDF de la resolución rectoral de promoción anticipada (Decreto 1290/2009, art. 7). Solo existe cuando la resolución ya fue emitida: lleva
 * el consecutivo, los considerandos tomados del trámite (concepto, consentimiento y decisión, con sus actas) y la huella SHA-256.
 */
export async function generarPdfResolucion(id: string, usuario: UserDocument): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  exigirGestionDeTramites(usuario);
  const t = await PromocionAnticipada.findById(id);
  if (!t) throw new ApiError(404, 'Trámite de promoción anticipada no encontrado.');
  if (!t.resolucion) throw new ApiError(409, 'El trámite aún no tiene resolución rectoral.');

  const [institucion, estudiante, gradoOrigen, gradoDestino, rector] = await Promise.all([
    Institution.findOne(),
    User.findById(t.student_id).select('nombre apellido tipo_documento numero_documento'),
    Grade.findById(t.grado_origen_id).select('nombre'),
    t.aplicacion ? Grade.findById(t.aplicacion.grado_destino_id).select('nombre') : null,
    User.findById(t.resolucion.emitida_por).select('nombre apellido'),
  ]);
  const nombreEstudiante = estudiante ? `${estudiante.nombre} ${estudiante.apellido}` : 'el estudiante';

  const doc = new PDFDocument({ size: 'LETTER', margins: { top: MARGEN, left: MARGEN, right: MARGEN, bottom: MARGEN }, bufferPages: true });
  const partes: Buffer[] = [];
  doc.on('data', (p: Buffer) => partes.push(p));
  const listo = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });

  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.cuerpo).text(institucion?.nombre ?? 'Institución Educativa', { align: 'center' });
  if (institucion?.codigo_dane) doc.font('Helvetica').fontSize(9).fillColor(COLOR.tenue).text(`DANE ${institucion.codigo_dane}`, { align: 'center' });
  doc.moveDown(1).font('Helvetica-Bold').fontSize(14).fillColor(COLOR.ink).text(`RESOLUCIÓN RECTORAL N.º ${t.resolucion.codigo}`, { align: 'center' });
  doc.font('Helvetica').fontSize(10).fillColor(COLOR.cuerpo).text(formatoFecha(t.resolucion.fecha), { align: 'center' });
  doc.moveDown(0.6).font('Helvetica-Bold').fontSize(10).fillColor(COLOR.ink).text(`Por la cual se promueve anticipadamente a ${nombreEstudiante} al grado siguiente.`, { align: 'center' });

  doc.moveDown(1).font('Helvetica-Bold').fontSize(10).fillColor(COLOR.primario).text('CONSIDERANDO');
  doc.moveDown(0.3).font('Helvetica').fontSize(9.5).fillColor(COLOR.cuerpo);
  const considerandos: string[] = [
    'Que el Decreto 1290 de 2009 (compilado en el Decreto 1075 de 2015) faculta al establecimiento educativo para promover anticipadamente, durante el primer periodo del año escolar, a los estudiantes con desempeño superior o a quienes no fueron promovidos el año anterior y demuestran haber superado lo que les faltaba, con consentimiento de los padres y decisión del Consejo Directivo, consignada en el registro escolar.',
    `Que ${nombreEstudiante} (${estudiante?.tipo_documento ?? ''} ${estudiante?.numero_documento ?? ''}) cursa el grado ${gradoOrigen?.nombre ?? ''} en el año lectivo ${t.anio} y la solicitud es por ${t.tipo === 'REINICIANTE' ? 'ser reiniciante' : 'rendimiento excepcional'}.`,
    `Que en el periodo ${t.evaluacion.periodo} el estudiante obtuvo un promedio de ${t.evaluacion.promedio ?? 'sin dato'}, con lo cual cumple los criterios definidos en el sistema institucional de evaluación.`,
  ];
  if (t.concepto_comision) considerandos.push(`Que la Comisión de Evaluación y Promoción emitió concepto ${t.concepto_comision.favorable ? 'favorable' : 'desfavorable'} en el acta ${t.concepto_comision.acta}.`);
  if (t.consentimiento) considerandos.push(`Que ${t.consentimiento.otorgado_por.nombre} (documento ${t.consentimiento.otorgado_por.documento}) ${t.consentimiento.otorgado ? 'otorgó' : 'no otorgó'} su consentimiento el ${formatoFecha(t.consentimiento.fecha)}.`);
  if (t.decision_consejo) considerandos.push(`Que el Consejo Directivo ${t.decision_consejo.aprobada ? 'aprobó' : 'no aprobó'} la promoción anticipada en el acta ${t.decision_consejo.acta}.`);
  if (t.resolucion.fundamento.trim()) considerandos.push(t.resolucion.fundamento.trim());
  considerandos.forEach((c, i) => doc.text(`${i + 1}. ${c}`, { align: 'justify' }).moveDown(0.3));

  doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).fillColor(COLOR.primario).text('RESUELVE');
  doc.moveDown(0.3).font('Helvetica').fontSize(9.5).fillColor(COLOR.cuerpo);
  doc.text(`ARTÍCULO 1.º Promover anticipadamente a ${nombreEstudiante} del grado ${gradoOrigen?.nombre ?? ''} al grado ${gradoDestino?.nombre ?? 'siguiente'}.`, { align: 'justify' }).moveDown(0.3);
  doc.text(`ARTÍCULO 2.º Respecto de los periodos que el estudiante no cursó en el grado nuevo, ${DESCRIPCION_TRATAMIENTO[t.reglas.tratamiento_notas]}.`, { align: 'justify' }).moveDown(0.3);
  doc.text('ARTÍCULO 3.º Consignar esta decisión en el registro escolar del estudiante y comunicarla a sus padres o acudientes.', { align: 'justify' });

  doc.moveDown(2).font('Helvetica').fontSize(9.5).fillColor(COLOR.cuerpo).text('Comuníquese y cúmplase.', { align: 'left' });
  doc.moveDown(3).moveTo(MARGEN, doc.y).lineTo(MARGEN + 200, doc.y).strokeColor(COLOR.borde).lineWidth(0.7).stroke();
  doc.moveDown(0.3).font('Helvetica-Bold').text(rector ? `${rector.nombre} ${rector.apellido}` : 'Rector(a)');
  doc.font('Helvetica').text('Rector(a)');
  doc.moveDown(1).font('Courier').fontSize(7.5).fillColor(COLOR.tenue).text(`Huella SHA-256: ${t.resolucion.hash}`);

  doc.end();
  const buffer = await listo;
  await registrarEvento({ usuario_id: usuario._id, accion: 'PROMOCION_ANTICIPADA_PDF_GENERADO', entidad: 'PromocionAnticipada', entidad_id: t._id, detalle: t.resolucion.codigo });
  return { buffer, nombreArchivo: `${t.resolucion.codigo}.pdf` };
}
