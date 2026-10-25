const TIPOS_ADMITIDOS = ['image/png', 'image/jpeg', 'image/webp'];
const ANCHO_MAXIMO = 1600;
const BYTES_MAXIMOS = 2 * 1024 * 1024;

export interface ImagenReducida {
  /** La imagen como data URI JPEG, lista para viajar dentro del JSON. */
  dataUri: string;
  bytes: number;
}

/** Los bytes que pesa una imagen en data URI (la base64 ocupa 4/3 de lo que pesa el archivo). */
const bytesDeDataUri = (dataUri: string): number => Math.floor(((dataUri.length - dataUri.indexOf(',') - 1) * 3) / 4);

function cargar(archivo: File): Promise<HTMLImageElement> {
  return new Promise((resolver, rechazar) => {
    const url = URL.createObjectURL(archivo);
    const imagen = new window.Image();
    imagen.onload = () => {
      URL.revokeObjectURL(url);
      resolver(imagen);
    };
    imagen.onerror = () => {
      URL.revokeObjectURL(url);
      rechazar(new Error('No se pudo leer la imagen.'));
    };
    imagen.src = url;
  });
}

/**
 * Prepara la portada de una noticia: la reduce a lo que se ve en pantalla (1600 px de ancho como mucho) y la pasa a JPEG, y si aún pesa más de 2 MB va bajando la calidad.
 * Así se puede elegir una foto grande de la cámara sin pensar en el peso. El servidor confirma después que sea una imagen de verdad.
 */
export async function reducirPortada(archivo: File): Promise<ImagenReducida> {
  if (!TIPOS_ADMITIDOS.includes(archivo.type)) throw new Error('La portada debe ser un PNG, JPG o WEBP.');
  const imagen = await cargar(archivo);
  const escala = Math.min(1, ANCHO_MAXIMO / imagen.naturalWidth);
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.max(1, Math.round(imagen.naturalWidth * escala));
  lienzo.height = Math.max(1, Math.round(imagen.naturalHeight * escala));
  const contexto = lienzo.getContext('2d');
  if (!contexto) throw new Error('No se pudo leer la imagen.');
  // Una imagen con transparencia no debe quedar con el fondo negro del JPEG.
  contexto.fillStyle = '#FFFFFF';
  contexto.fillRect(0, 0, lienzo.width, lienzo.height);
  contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);

  for (const calidad of [0.88, 0.8, 0.7, 0.6, 0.5]) {
    const dataUri = lienzo.toDataURL('image/jpeg', calidad);
    const bytes = bytesDeDataUri(dataUri);
    if (bytes <= BYTES_MAXIMOS) return { dataUri, bytes };
  }
  throw new Error('La imagen sigue pesando más de 2 MB: usa una más pequeña.');
}
