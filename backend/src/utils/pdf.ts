import PDFDocument from 'pdfkit';

export type Documento = InstanceType<typeof PDFDocument>;

// Los mismos tonos de la guía visual (Klassy UI Spec), para que el papel se parezca a la pantalla.
export const COLOR = {
  ink: '#172235',
  cuerpo: '#3F4D61',
  tenue: '#788794',
  borde: '#DDE4EC',
  primario: '#2878EA',
  primarioSuave: '#EAF3FF',
  peligro: '#EF5350',
  peligroSuave: '#FFF0F0',
  alertaSuave: '#FFF5E6',
  suave: '#F1F5F9',
};

/** Recoge lo que pdfkit escribe y lo entrega como Buffer cuando se llama a `doc.end()`. Se invoca antes de dibujar. */
export function bufferDeDocumento(doc: Documento): Promise<Buffer> {
  const partes: Buffer[] = [];
  doc.on('data', (parte: Buffer) => partes.push(parte));
  return new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });
}
