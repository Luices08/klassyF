import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { ClaveCertificado, definicionCertificado } from '../constants/certificados';
import { ContenidoPlantilla } from '../constants/plantillasCertificado';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { redactarCertificado, nombreDeJornada } from '../utils/certificadoTexto';
import { BloqueResuelto, ImagenGuardada, SnapshotCertificado, TablaValoraciones, claveCorta } from '../utils/certificados';
import { leerImagenGuardada } from '../utils/almacenImagenes';
import { registrarEvento } from './audit.service';
import { cargarCertificado, huellaActual, prepararVistaPrevia, EntradaExpedicion } from './certificado.service';
import { snapshotDeVistaPreviaDePlantilla } from './certificadoPlantilla.service';
import { COLOR, MARGEN, cargarEscudoCongelado, dibujarEncabezado } from './encabezadoInstitucional.service';
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

const leerImagen = async (imagen: ImagenGuardada | null, etiqueta: string): Promise<Buffer | null> => (imagen ? leerImagenGuardada(imagen, etiqueta) : null);

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

/**
 * Dibuja la tabla de valoraciones tal como la entregó quien la armó (columnas y filas ya son texto): M26 no sabe qué columnas hay ni
 * cómo se calculan. La primera columna se lleva más ancho; las filas de área van en negrita.
 */
function dibujarTablaNotas(doc: Documento, tabla: TablaValoraciones, ancho: number): void {
  const n = tabla.columnas.length;
  if (n === 0) return;
  const unidades = n === 1 ? 1 : 3 + (n - 1);
  const anchos = tabla.columnas.map((_c, i) => ((i === 0 ? 3 : 1) / unidades) * ancho);
  const alto = 15;
  const x0 = MARGEN;

  const fila = (valores: string[], opciones: { negrita?: boolean; fondo?: string } = {}) => {
    if (doc.y > doc.page.height - 360) doc.addPage();
    const y = doc.y;
    if (opciones.fondo) doc.rect(x0, y, ancho, alto).fill(opciones.fondo);
    doc.font(opciones.negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(COLOR.ink);
    let x = x0;
    valores.forEach((v, i) => {
      doc.text(v, x + 2, y + 4, { width: (anchos[i] as number) - 4, height: alto - 4, lineBreak: false, ellipsis: true, align: i === 0 ? 'left' : 'center' });
      x += anchos[i] as number;
    });
    doc.y = y + alto;
    doc.moveTo(x0, doc.y).lineTo(x0 + ancho, doc.y).strokeColor(COLOR.borde).lineWidth(0.4).stroke();
  };

  doc.moveDown(0.6);
  fila(tabla.columnas, { negrita: true, fondo: COLOR.borde });
  for (const f of tabla.filas) fila(f.nivel === 'ASIGNATURA' ? [`   ${f.celdas[0] ?? ''}`, ...f.celdas.slice(1)] : f.celdas, { negrita: f.nivel === 'AREA' });
  if (tabla.pie) doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.tenue).text(tabla.pie, x0, doc.y + 4, { width: ancho });
}

/** Dibuja los bloques que resolvió la plantilla vigente al expedir, en su orden. */
function dibujarBloques(doc: Documento, snapshot: SnapshotCertificado, bloques: BloqueResuelto[], ancho: number): void {
  bloques.forEach((b, i) => {
    switch (b.estilo) {
      case 'PREAMBULO':
        doc.moveDown(i === 0 ? 2.5 : 1).font('Helvetica').fontSize(11).fillColor(COLOR.cuerpo).text(b.texto, MARGEN, doc.y, { width: ancho, align: 'center' });
        break;
      case 'FORMULA':
        doc.moveDown(1.2).font('Helvetica-Bold').fontSize(15).fillColor(COLOR.ink).text(b.texto, MARGEN, doc.y, { width: ancho, align: 'center' });
        break;
      case 'DESTACADO':
        doc.moveDown(1).font('Helvetica-Bold').fontSize(12).fillColor(COLOR.ink).text(b.texto, MARGEN, doc.y, { width: ancho, align: 'left' });
        break;
      case 'TABLA_NOTAS':
        if (snapshot.estudios) dibujarTablaNotas(doc, snapshot.estudios.tabla, ancho);
        break;
      default:
        doc.moveDown(1).font('Helvetica').fontSize(12).fillColor(COLOR.cuerpo).text(b.texto, MARGEN, doc.y, { width: ancho, align: 'justify', lineGap: 4 });
    }
  });
}

async function dibujar(snapshot: SnapshotCertificado, seguridad: DatosSeguridad): Promise<Buffer> {
  const [logo, imgRectoria, imgSecretaria, imgSello] = await Promise.all([
    cargarEscudoCongelado(snapshot.encabezado.escudo),
    leerImagen(snapshot.firmas.rectoria.imagen, 'Rectoría'),
    leerImagen(snapshot.firmas.secretaria.imagen, 'Secretaría Académica'),
    leerImagen(snapshot.firmas.sello.imagen, 'sello institucional'),
  ]);
  const qr = seguridad.urlVerificacion ? await QRCode.toBuffer(seguridad.urlVerificacion, { errorCorrectionLevel: 'M', margin: 1, width: 300 }) : null;
  const def = definicionCertificado(snapshot.tipo);
  const titulo = snapshot.contenido?.titulo ?? def.nombre;

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGEN, info: { Title: `${titulo} ${seguridad.codigo ?? ''}`.trim(), Producer: 'Klassy' } });
    const trozos: Buffer[] = [];
    doc.on('data', (t) => trozos.push(t));
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);

    try {
      const e = snapshot.encabezado;
      dibujarEncabezado(doc, { ...e, jornada: nombreDeJornada(e.jornada) }, titulo, seguridad.codigo ?? 'VISTA PREVIA', logo);

      const ancho = doc.page.width - MARGEN * 2;
      if (snapshot.contenido) {
        dibujarBloques(doc, snapshot, snapshot.contenido.bloques, ancho);
      } else {
        // Documentos anteriores a las plantillas: se redactan como cuando se expidieron.
        const texto = redactarCertificado(snapshot);
        doc.moveDown(2.5).font('Helvetica').fontSize(11).fillColor(COLOR.cuerpo).text(texto.preambulo, MARGEN, doc.y, { width: ancho, align: 'center' });
        doc.moveDown(1.2).font('Helvetica-Bold').fontSize(15).fillColor(COLOR.ink).text(texto.formula, { width: ancho, align: 'center' });
        doc.moveDown(1).font('Helvetica').fontSize(12).fillColor(COLOR.cuerpo).text(texto.cuerpo, { width: ancho, align: 'justify', lineGap: 4 });
        if (snapshot.estudios) dibujarTablaNotas(doc, snapshot.estudios.tabla, ancho);
        if (texto.concepto) doc.moveDown(1).font('Helvetica-Bold').fontSize(12).fillColor(snapshot.estudios?.promocion ? COLOR.ink : COLOR.peligro).text(texto.concepto, MARGEN, doc.y, { width: ancho, align: 'left' });
        doc.moveDown(1.2).font('Helvetica').fontSize(12).fillColor(COLOR.cuerpo).text(texto.cierre, MARGEN, doc.y, { width: ancho, align: 'justify', lineGap: 4 });
      }

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

export async function generarVistaPreviaPdf(entrada: EntradaExpedicion, usuario: UserDocument, ip?: string | null): Promise<Buffer> {
  const snapshot = await prepararVistaPrevia(entrada, usuario);
  const buffer = await dibujar(snapshot, { codigo: null });
  // Muestra datos reales de un estudiante: se audita aunque no quede nada guardado (sin contenido en el detalle).
  await registrarEvento({ usuario_id: usuario._id, accion: 'CERTIFICADO_VISTA_PREVIA', entidad: 'Enrollment', entidad_id: entrada.enrollment_id, detalle: entrada.tipo, ip });
  return buffer;
}

/** Vista previa de un borrador de plantilla con un estudiante inventado: sirve para ver cómo queda antes de publicarla. */
export async function generarVistaPreviaDePlantillaPdf(tipo: ClaveCertificado, borrador: ContenidoPlantilla, usuario: UserDocument): Promise<Buffer> {
  return dibujar(await snapshotDeVistaPreviaDePlantilla(tipo, borrador, usuario), { codigo: null });
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
