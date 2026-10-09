import path from 'path';
import { FORMATOS_EVIDENCIA, FormatoEvidencia } from '../constants/actividades';
import { detectarFirmaArchivo } from './firmasArchivo';

export interface EvidenciaDetectada {
  formato: FormatoEvidencia;
  ext: string;
  mimetype: string;
}

// Los .docx/.xlsx/.pptx son ZIP: la firma sola no distingue un Word de cualquier otro ZIP, así que además se exige la
// extensión coherente con el mimetype declarado y la carpeta propia de cada formato dentro del paquete.
const OOXML: Array<{ formato: FormatoEvidencia; ext: string; carpeta: string }> = [
  { formato: 'WORD', ext: '.docx', carpeta: 'word/' },
  { formato: 'EXCEL', ext: '.xlsx', carpeta: 'xl/' },
  { formato: 'POWERPOINT', ext: '.pptx', carpeta: 'ppt/' },
];

const FIRMA_ZIP = '504b0304';

/** La extensión y el formato salen de los bytes, nunca del nombre o del mimetype que mandó el cliente. */
export function detectarEvidencia(mimetypeDeclarado: string, nombreOriginal: string, buffer: Buffer): EvidenciaDetectada | null {
  const clasica = detectarFirmaArchivo(mimetypeDeclarado, buffer);
  if (clasica) {
    return { formato: clasica.mimetype === 'application/pdf' ? 'PDF' : 'IMAGEN', ext: clasica.ext, mimetype: clasica.mimetype };
  }

  if (buffer.subarray(0, 4).toString('hex') !== FIRMA_ZIP) return null;
  const ext = path.extname(nombreOriginal).toLowerCase();
  const ooxml = OOXML.find((o) => o.ext === ext && FORMATOS_EVIDENCIA[o.formato].mimetypes.includes(mimetypeDeclarado));
  if (!ooxml || !buffer.includes(ooxml.carpeta)) return null;
  return { formato: ooxml.formato, ext: ooxml.ext, mimetype: mimetypeDeclarado };
}
