import fs from 'fs/promises';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { definicionCertificado } from '../constants/certificados';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { redactarCertificado, nombreDeJornada } from '../utils/certificadoTexto';
import { ImagenGuardada, SnapshotCertificado, claveCorta } from '../utils/certificados';
import { rutaImagenAutenticacion } from '../utils/uploadPaths';
import { registrarEvento } from './audit.service';
import { cargarCertificado, huellaActual, prepararVistaPrevia, EntradaExpedicion } from './certificado.service';
import { COLOR, MARGEN, cargarLogo, dibujarEncabezado } from './encabezadoInstitucional.service';
import User from '../models/user.model';

type Documento = InstanceType<typeof PDFDocument>;

/** Lo que el PDF necesita además del snapshot. Sin `codigo` es una vista previa: no tiene QR, huella ni validez. */
interface DatosSeguridad {
  codigo: string | null;
  hash?: string;
  /** URL que va dentro del QR (lleva el token opaco). */
  urlVerificacion?: string;
  /** Dirección para verificar con código y clave, sin QR. */
  urlManual?: string;
  expedidoPor?: string | null;
  anulado?: boolean;
}

async function leerImagen(imagen: ImagenGuardada | null, etiqueta: string): Promise<Buffer | null> {
  if (!imagen) return null;
  try {
    return await fs.readFile(rutaImagenAutenticacion(imagen.hash, imagen.ext));
  } catch {
    // El documento dice que lleva esta imagen: imprimirlo sin ella sería un documento distinto al expedido.
    throw new ApiError(500, `Falta el archivo de la imagen de ${etiqueta} que se estampó al expedir este documento.`);
  }
}

const fechaHora = (iso: string): string =>
  new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });

function marcaDeAgua(doc: Documento, texto: string, color: string): void {
  doc.save();
  doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc.font('Helvetica-Bold').fontSize(96).fillColor(color).opacity(0.12).text(texto, 0, doc.page.height / 2 - 48, { width: doc.page.width, align: 'center', lineBreak: false });
  doc.restore();
  doc.opacity(1);
}

function bloqueFirma(doc: Documento, x: number, ancho: number, y: number, firma: SnapshotCertificado['firmas']['rectoria'], imagen: Buffer | null, rotuloPorDefecto: string): void {
  if (imagen) {
    try {
      doc.image(imagen, x + 10, y - 62, { fit: [ancho - 20, 58], align: 'center', valign: 'bottom' });
    } catch {
      throw new ApiError(500, `La imagen de la firma de ${firma.cargo} no se puede leer.`);
    }
  }
  doc.moveTo(x + 8, y).lineTo(x + ancho - 8, y).strokeColor(COLOR.tenue).lineWidth(0.7).stroke();
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR.ink).text(firma.nombre ?? rotuloPorDefecto, x + 8, y + 5, { width: ancho - 16, align: 'center' });
  doc.font('Helvetica').fontSize(8.5).fillColor(COLOR.tenue).text(firma.cargo, x + 8, doc.y, { width: ancho - 16, align: 'center' });
}

async function dibujar(snapshot: SnapshotCertificado, seguridad: DatosSeguridad): Promise<Buffer> {
  const [logo, imgRectoria, imgSecretaria, imgSello] = await Promise.all([
    cargarLogo(),
    leerImagen(snapshot.firmas.rectoria.imagen, 'Rectoría'),
    leerImagen(snapshot.firmas.secretaria.imagen, 'Secretaría Académica'),
    leerImagen(snapshot.firmas.sello.imagen, 'sello institucional'),
  ]);
  const qr = seguridad.urlVerificacion ? await QRCode.toBuffer(seguridad.urlVerificacion, { errorCorrectionLevel: 'M', margin: 1, width: 300 }) : null;
  const texto = redactarCertificado(snapshot);
  const def = definicionCertificado(snapshot.tipo);

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGEN, info: { Title: `${def.nombre} ${seguridad.codigo ?? ''}`.trim(), Producer: 'Klassy' } });
    const trozos: Buffer[] = [];
    doc.on('data', (t) => trozos.push(t));
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);

    try {
      const e = snapshot.encabezado;
      dibujarEncabezado(doc, { ...e, jornada: nombreDeJornada(e.jornada) }, def.nombre, seguridad.codigo ?? 'VISTA PREVIA', logo);

      const ancho = doc.page.width - MARGEN * 2;
      doc.moveDown(2.5).font('Helvetica').fontSize(11).fillColor(COLOR.cuerpo).text(texto.preambulo, MARGEN, doc.y, { width: ancho, align: 'center' });
      doc.moveDown(1.2).font('Helvetica-Bold').fontSize(15).fillColor(COLOR.ink).text(texto.formula, { width: ancho, align: 'center' });
      doc.moveDown(1).font('Helvetica').fontSize(12).fillColor(COLOR.cuerpo).text(texto.cuerpo, { width: ancho, align: 'justify', lineGap: 4 });
      doc.moveDown(1.2).text(texto.cierre, { width: ancho, align: 'justify', lineGap: 4 });

      // Firmas: con el switch apagado queda la línea con nombre y cargo para la firma manuscrita.
      if (doc.y > doc.page.height - 330) doc.addPage();
      const yFirma = doc.y + 95;
      const columna = ancho / 2;
      bloqueFirma(doc, MARGEN, columna, yFirma, snapshot.firmas.rectoria, imgRectoria, 'Rectoría');
      bloqueFirma(doc, MARGEN + columna, columna, yFirma, snapshot.firmas.secretaria, imgSecretaria, 'Secretaría Académica');
      if (imgSello) {
        doc.save().opacity(0.9);
        doc.image(imgSello, doc.page.width / 2 - 45, yFirma - 78, { fit: [90, 90], align: 'center', valign: 'center' });
        doc.restore();
        doc.opacity(1);
      }

      // Verificación: el QR solo lleva un token opaco; los datos no viajan en él.
      const yBloque = Math.max(doc.y + 30, yFirma + 60);
      doc.moveTo(MARGEN, yBloque).lineTo(doc.page.width - MARGEN, yBloque).strokeColor(COLOR.borde).lineWidth(0.7).stroke();
      const xTexto = qr ? MARGEN + 86 : MARGEN;
      if (qr) doc.image(qr, MARGEN, yBloque + 8, { fit: [76, 76] });
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR.ink).text('Verifique la autenticidad de este documento', xTexto, yBloque + 10, { width: doc.page.width - MARGEN - xTexto });
      doc.font('Helvetica').fontSize(8).fillColor(COLOR.cuerpo);
      if (seguridad.codigo && seguridad.hash && seguridad.urlManual) {
        doc.text(`Escanee el código QR, o ingrese a ${seguridad.urlManual} e indique el código ${seguridad.codigo} y la clave ${claveCorta(seguridad.hash)}.`, xTexto, doc.y + 2, { width: doc.page.width - MARGEN - xTexto });
        doc.fillColor(COLOR.tenue).text(`Huella de integridad: ${seguridad.hash.slice(0, 32).toUpperCase()}`, xTexto, doc.y + 4, { width: doc.page.width - MARGEN - xTexto });
        if (seguridad.expedidoPor) doc.text(`Expedido por ${seguridad.expedidoPor} el ${fechaHora(snapshot.fecha_expedicion)}.`, xTexto, doc.y + 2, { width: doc.page.width - MARGEN - xTexto });
      } else {
        doc.fillColor(COLOR.peligro).text('VISTA PREVIA: este borrador no tiene consecutivo, huella ni código QR y no tiene validez.', xTexto, doc.y + 2, { width: doc.page.width - MARGEN - xTexto });
      }

      if (!seguridad.codigo) marcaDeAgua(doc, 'VISTA PREVIA', COLOR.tenue);
      else if (seguridad.anulado) marcaDeAgua(doc, 'ANULADO', COLOR.peligro);
      doc.end();
    } catch (err) {
      doc.end();
      reject(err);
    }
  });
}

export async function generarVistaPreviaPdf(entrada: EntradaExpedicion, usuario: UserDocument): Promise<Buffer> {
  return dibujar(await prepararVistaPrevia(entrada, usuario), { codigo: null });
}

/**
 * Reimpresión del documento expedido: se dibuja SOLO desde el snapshot congelado, así sale idéntico cada vez. Antes se
 * recalcula la huella: un documento alterado en la base no se imprime.
 */
export async function generarPdfDeCertificado(id: string, urlBase: string, usuario: UserDocument, ip?: string | null): Promise<{ buffer: Buffer; nombreArchivo: string }> {
  const certificado = await cargarCertificado(id, usuario);
  if (huellaActual(certificado) !== certificado.hash) {
    throw new ApiError(409, 'La huella de este documento no coincide con la sellada al expedirlo: no se puede imprimir. Avisa al administrador.');
  }
  const emisor = await User.findById(certificado.emitido_por).select('nombre apellido');
  const buffer = await dibujar(certificado.snapshot as SnapshotCertificado, {
    codigo: certificado.codigo,
    hash: certificado.hash,
    urlVerificacion: `${urlBase}/verificar/${certificado.token_verificacion}`,
    urlManual: `${urlBase}/verificar`,
    expedidoPor: emisor ? `${emisor.nombre} ${emisor.apellido}` : null,
    anulado: certificado.estado === 'ANULADO',
  });
  await registrarEvento({ usuario_id: usuario._id, accion: 'CERTIFICADO_DESCARGADO', entidad: 'CertificadoEmitido', entidad_id: certificado._id, detalle: certificado.codigo, ip });
  return { buffer, nombreArchivo: `${certificado.codigo}.pdf` };
}
