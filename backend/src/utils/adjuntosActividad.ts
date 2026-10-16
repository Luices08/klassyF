import path from 'path';
import { TipoAdjunto } from '../constants/actividades';
import { detectarEvidencia } from './evidenciasActividad';

export interface AdjuntoDetectado {
  tipo: TipoAdjunto;
  ext: string;
  mimetype: string;
}

export const MIMETYPES_ADJUNTO_MEDIOS = ['audio/mpeg', 'video/mp4'] as const;

const esMp3 = (b: Buffer): boolean => b.subarray(0, 3).toString('latin1') === 'ID3' || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0);
const esMp4 = (b: Buffer): boolean => b.subarray(4, 8).toString('latin1') === 'ftyp';

/**
 * Qué es un archivo que el docente adjunta, decidido por sus bytes (el nombre y el mimetype los manda el cliente). Admite lo mismo
 * que las evidencias de los estudiantes más audio MP3 y video MP4.
 */
export function detectarAdjunto(mimetypeDeclarado: string, nombreOriginal: string, buffer: Buffer): AdjuntoDetectado | null {
  const evidencia = detectarEvidencia(mimetypeDeclarado, nombreOriginal, buffer);
  if (evidencia) return { tipo: evidencia.formato, ext: evidencia.ext, mimetype: evidencia.mimetype };

  const ext = path.extname(nombreOriginal).toLowerCase();
  if (mimetypeDeclarado === 'audio/mpeg' && ext === '.mp3' && esMp3(buffer)) return { tipo: 'AUDIO', ext: '.mp3', mimetype: 'audio/mpeg' };
  if (mimetypeDeclarado === 'video/mp4' && ext === '.mp4' && esMp4(buffer)) return { tipo: 'VIDEO', ext: '.mp4', mimetype: 'video/mp4' };
  return null;
}
