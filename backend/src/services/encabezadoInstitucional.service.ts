import PDFDocument from 'pdfkit';
import Institution from '../models/institution.model';
import { guardarImagenPorContenido, huellaDeImagen, imagenDesdeDataUri, existeImagen, leerImagenGuardada } from '../utils/almacenImagenes';
import type { ImagenGuardada } from '../utils/certificados';

type Documento = InstanceType<typeof PDFDocument>;

export const COLOR = { ink: '#172235', cuerpo: '#3F4D61', tenue: '#788794', borde: '#DDE4EC', primario: '#2878EA', peligro: '#EF5350', suave: '#F1F5F9' };
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
  const institucion = await Institution.findOne().select('logo_url');
  return imagenDesdeDataUri(institucion?.logo_url)?.buffer ?? null;
}

/** Guarda el escudo (el logo de M01) por su huella y devuelve la referencia que queda en el documento expedido. */
export async function congelarEscudo(logoUrl: string | null | undefined): Promise<ImagenGuardada | null> {
  const imagen = imagenDesdeDataUri(logoUrl);
  return imagen ? guardarImagenPorContenido(imagen.buffer, imagen.ext) : null;
}

/**
 * El escudo con el que se expidió un documento. `undefined` = documento anterior al congelamiento (usa el logo vigente);
 * `null` = el colegio no tenía escudo; una referencia = el congelado. Si su archivo se perdió pero el logo vigente es el mismo,
 * se restaura solo; si el colegio cambió de logo, se avisa cómo recuperarlo.
 */
export async function cargarEscudoCongelado(referencia: ImagenGuardada | null | undefined): Promise<Buffer | null> {
  if (referencia === undefined) return cargarLogo();
  if (referencia === null) return null;
  if (await existeImagen(referencia)) return leerImagenGuardada(referencia, 'escudo');
  const vigente = imagenDesdeDataUri((await Institution.findOne().select('logo_url'))?.logo_url);
  if (vigente && huellaDeImagen(vigente.buffer) === referencia.hash) {
    await guardarImagenPorContenido(vigente.buffer, vigente.ext);
    return vigente.buffer;
  }
  return leerImagenGuardada(referencia, 'escudo');
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
