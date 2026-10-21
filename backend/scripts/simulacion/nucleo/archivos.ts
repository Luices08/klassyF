/**
 * PDFs de una página para lo que el sistema exige como archivo (planes de área y de aula, documentos de matrícula). El
 * servidor confirma el tipo por la firma de bytes, así que tienen que ser PDF de verdad, no un texto con extensión .pdf.
 */
import PDFDocument from 'pdfkit';
import { ArchivoSubida } from './api';

export async function pdfSimple(titulo: string, lineas: string[] = []): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 60, info: { Title: titulo, Producer: 'Klassy — simulación' } });
    const partes: Buffer[] = [];
    doc.on('data', (b: Buffer) => partes.push(b));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
    doc.fontSize(16).text(titulo);
    doc.moveDown();
    doc.fontSize(10).fillColor('#3F4D61');
    for (const linea of lineas) doc.text(linea);
    doc.moveDown().fontSize(8).fillColor('#788794').text('Documento generado por la simulación de datos de Klassy (no es un documento real).');
    doc.end();
  });
}

export async function archivoPdf(nombre: string, titulo: string, lineas: string[] = []): Promise<ArchivoSubida> {
  return { nombre: `${nombre}.pdf`, contenido: await pdfSimple(titulo, lineas), tipo: 'application/pdf' };
}
