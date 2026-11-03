import { createHash } from 'crypto';
import { deflateSync } from 'zlib';

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (TABLA_CRC[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function trozo(tipo: string, datos: Buffer): Buffer {
  const cabecera = Buffer.alloc(4);
  cabecera.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const suma = Buffer.alloc(4);
  suma.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([cabecera, cuerpo, suma]);
}

/** PNG válido de un solo color que depende de la semilla: dos semillas distintas dan archivos distintos (el almacén de imágenes los identifica por contenido). */
export function pngDePrueba(semilla: string, lado = 16): Buffer {
  const [r, g, b] = createHash('sha256').update(semilla).digest();
  const fila = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: lado }, () => [r, g, b]).flat() as number[])]);
  const pixeles = Buffer.concat(Array.from({ length: lado }, () => fila));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8; // profundidad de bits
  ihdr[9] = 2; // color verdadero RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo('IHDR', ihdr), trozo('IDAT', deflateSync(pixeles)), trozo('IEND', Buffer.alloc(0))]);
}
