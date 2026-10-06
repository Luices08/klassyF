import { COLOR, Documento } from '../../../utils/pdf';
import { buscarInstitucion } from '../../../services/institution.service';


export const MARGEN = 50;

export interface DatosEncabezado {
  institucion: string;
  codigo_dane: string;
  nit: string;
  resolucion_aprobacion: string;
  sede: string;
  jornada: string;
  anio: number | null;
}

/** El logo de la institución (data URI PNG/JPEG de M01). Si falta o no se puede leer, el documento sale igual solo con texto. */
export async function cargarLogo(): Promise<Buffer | null> {
  const institucion = await buscarInstitucion({ campos: 'logo_url' });
  const coincide = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(institucion?.logo_url ?? '');
  return coincide ? Buffer.from(coincide[2] as string, 'base64') : null;
}

/**
 * ÚNICO punto que arma el encabezado de los documentos de M16 (institución, DANE, NIT, resolución, sede, jornada, año y logo).
 * Cuando M21/M32 permitan personalizar formatos, se reemplaza esta función y ningún documento cambia.
 */
export function dibujarEncabezado(doc: Documento, datos: DatosEncabezado, tituloDocumento: string, codigo: string, logo: Buffer | null): void {
  const inicioY = doc.y;
  let xTexto = MARGEN;
  if (logo) {
    try {
      doc.image(logo, MARGEN, inicioY, { fit: [52, 52] });
      xTexto = MARGEN + 64;
    } catch {
      // Imagen corrupta o formato que pdfkit no lee: se omite, el documento no depende del logo.
    }
  }
  const ancho = doc.page.width - MARGEN - xTexto;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR.ink).text(datos.institucion, xTexto, inicioY, { width: ancho });
  doc.font('Helvetica').fontSize(8.5).fillColor(COLOR.tenue);
  const linea = [datos.codigo_dane && `DANE ${datos.codigo_dane}`, datos.nit && `NIT ${datos.nit}`, datos.resolucion_aprobacion && `Res. ${datos.resolucion_aprobacion}`].filter(Boolean).join(' · ');
  if (linea) doc.text(linea, xTexto, doc.y, { width: ancho });
  doc.text([datos.sede, datos.jornada && `Jornada ${datos.jornada.toLowerCase()}`, datos.anio && `Año lectivo ${datos.anio}`].filter(Boolean).join(' · '), xTexto, doc.y, { width: ancho });
  doc.y = Math.max(doc.y, inicioY + 56);
  doc.x = MARGEN;
  doc.moveDown(0.6).font('Helvetica-Bold').fontSize(15).fillColor(COLOR.ink).text(tituloDocumento);
  doc.font('Helvetica').fontSize(9).fillColor(COLOR.tenue).text(`Código ${codigo}`);
}
