import os from 'os';
import path from 'path';

// Las pruebas guardan sus archivos en una carpeta temporal propia (la llamamos `uploads` porque otros módulos guardan rutas relativas
// como `uploads/actividades/...`). Antes escribían, y al terminar borraban, en `backend/uploads`: eso eliminaba los archivos reales
// (firmas, soportes) de quien las corría.
process.env.UPLOADS_DIR ??= path.join(os.tmpdir(), `klassy-pruebas-${process.pid}`, 'uploads');

// `message` de un Error no es enumerable, y `toMatchObject` solo compara propiedades enumerables: una aserción como
// `rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/cerrada/) })` pasaba aunque el mensaje fuera otro.
// ApiError llama a `Error.captureStackTrace` al construirse, así que aquí (solo en pruebas) se aprovecha para dejar el
// mensaje comparable y que esas aserciones verifiquen de verdad.
const original = Error.captureStackTrace;
Error.captureStackTrace = function capturarYExponerMensaje(objetivo: object, constructor?: Function) {
  original.call(Error, objetivo, constructor);
  if (objetivo instanceof Error) Object.defineProperty(objetivo, 'message', { enumerable: true });
};
