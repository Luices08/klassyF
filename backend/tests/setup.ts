// `message` de un Error no es enumerable, y `toMatchObject` solo compara propiedades enumerables: una aserción como
// `rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/cerrada/) })` pasaba aunque el mensaje fuera otro.
// ApiError llama a `Error.captureStackTrace` al construirse, así que aquí (solo en pruebas) se aprovecha para dejar el
// mensaje comparable y que esas aserciones verifiquen de verdad.
const original = Error.captureStackTrace;
Error.captureStackTrace = function capturarYExponerMensaje(objetivo: object, constructor?: Function) {
  original.call(Error, objetivo, constructor);
  if (objetivo instanceof Error) Object.defineProperty(objetivo, 'message', { enumerable: true });
};
