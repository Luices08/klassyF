export { aplicaA, coincideAlcance, especificidad, resolverVariables } from './alcance';
export { EstadoHorario, PESO_DURO } from './evaluacion';
export { evaluarHorario, generarHorario } from './generador';
export type { OpcionesGeneracion, ResultadoMotor, UbicacionSesion } from './generador';
export { construirEstructura, diagnosticarCapacidad, expandirSesiones } from './sesiones';
export * from './tipos';
export { generarEnHilo } from './hilo';
