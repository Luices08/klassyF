// El mimetype de un archivo subido lo declara el cliente (header HTTP), nunca confiable por si
// solo. Esta firma por bytes la usa cualquier endpoint que reciba un PDF/JPG/PNG/WEBP de
// matricula (M04): la preinscripcion publica (sin sesion) y la carga por personal autenticado
// (enrollment.routes) — el riesgo de un mimetype falsificado no depende de si hay sesion.
export interface FirmaArchivo {
  ext: string;
  mimetype: string;
  coincide: (b: Buffer) => boolean;
}

export const FIRMAS_ARCHIVO: FirmaArchivo[] = [
  { ext: '.pdf', mimetype: 'application/pdf', coincide: (b) => b.subarray(0, 4).toString('latin1') === '%PDF' },
  { ext: '.jpg', mimetype: 'image/jpeg', coincide: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.png', mimetype: 'image/png', coincide: (b) => b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' },
  {
    ext: '.webp',
    mimetype: 'image/webp',
    coincide: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

/** La extension real del archivo sale de su firma de bytes, nunca del nombre que mandó el cliente. */
export function detectarFirmaArchivo(mimetypeDeclarado: string, buffer: Buffer): FirmaArchivo | null {
  return FIRMAS_ARCHIVO.find((f) => f.mimetype === mimetypeDeclarado && f.coincide(buffer)) ?? null;
}
